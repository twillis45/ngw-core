"""
Stripe Checkout integration.

Endpoints:
  POST /api/stripe/create-checkout-session
      Creates a Stripe Checkout Session and returns the hosted URL.
      The frontend redirects the user there to complete payment.

  POST /api/stripe/webhook
      Receives Stripe webhook events (checkout.session.completed, etc.)
      and records payment in the DB.

Required env vars:
  STRIPE_SECRET_KEY          sk_test_... / sk_live_...
  STRIPE_PRICE_ID_MONTHLY    price_... (Pro monthly)
  STRIPE_PRICE_ID_YEARLY     price_... (Pro yearly)
  STRIPE_WEBHOOK_SECRET      whsec_... (webhook signature verification)
"""

from __future__ import annotations

import os
import logging
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel

from auth.security import get_optional_user
from db.database import create_subscription, cancel_subscription_by_stripe_id, get_subscription_by_stripe_session

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Stripe client — initialised lazily so missing key only errors at call time,
# not at import time (keeps dev server bootable without Stripe creds).
# ---------------------------------------------------------------------------

def _get_stripe():
    key = os.getenv('STRIPE_SECRET_KEY')
    if not key:
        raise HTTPException(
            status_code=503,
            detail='Stripe is not configured. Set STRIPE_SECRET_KEY in the environment.',
        )
    stripe.api_key = key
    return stripe


PRICE_IDS: dict[str, Optional[str]] = {
    'monthly': os.getenv('STRIPE_PRICE_ID_MONTHLY'),
    'yearly':  os.getenv('STRIPE_PRICE_ID_YEARLY'),
}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CheckoutSessionRequest(BaseModel):
    billing_period: str = 'monthly'   # 'monthly' | 'yearly'
    plan: str = 'pro'
    success_url: str                   # must contain ?checkout_success=1
    cancel_url:  str


class CheckoutSessionResponse(BaseModel):
    url: str
    session_id: str


# ---------------------------------------------------------------------------
# POST /api/stripe/create-checkout-session
# ---------------------------------------------------------------------------

_ALLOWED_ORIGINS = [o.strip() for o in os.getenv('ALLOWED_ORIGINS', '').split(',') if o.strip()]


@router.post('/stripe/create-checkout-session', response_model=CheckoutSessionResponse)
async def create_checkout_session(
    body: CheckoutSessionRequest,
    user=Depends(get_optional_user),
):
    """Create a Stripe Checkout Session and return the hosted checkout URL.

    Requires a valid JWT — only registered users can initiate checkout.
    This prevents anonymous actors from creating Stripe sessions on behalf
    of the app, which could be used for phishing/misuse of the Stripe account.
    """
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required to start checkout. Please log in first.",
        )

    if body.plan != 'pro':
        raise HTTPException(400, f'Unsupported plan: {body.plan}')

    # Validate success_url and cancel_url origins to prevent open-redirect abuse.
    if _ALLOWED_ORIGINS:
        for url in (body.success_url, body.cancel_url):
            if not any(url.startswith(o) for o in _ALLOWED_ORIGINS):
                raise HTTPException(400, 'Invalid redirect URL origin.')

    price_id = PRICE_IDS.get(body.billing_period)
    if not price_id:
        raise HTTPException(
            400,
            f'No Stripe Price ID configured for billing_period="{body.billing_period}". '
            f'Set STRIPE_PRICE_ID_MONTHLY / STRIPE_PRICE_ID_YEARLY in the environment.',
        )

    _stripe = _get_stripe()

    try:
        session = _stripe.checkout.Session.create(
            mode='subscription',
            line_items=[{'price': price_id, 'quantity': 1}],
            # Stripe appends session_id automatically when the placeholder is present
            success_url=body.success_url + '&session_id={CHECKOUT_SESSION_ID}',
            cancel_url=body.cancel_url,
            allow_promotion_codes=True,
        )
    except _stripe.error.StripeError as exc:
        logger.error('Stripe error creating session: %s', exc)
        raise HTTPException(502, f'Stripe error: {exc.user_message or str(exc)}')

    return CheckoutSessionResponse(url=session.url, session_id=session.id)


# ---------------------------------------------------------------------------
# POST /api/stripe/webhook
# ---------------------------------------------------------------------------

@router.post('/stripe/webhook')
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias='stripe-signature'),
):
    """
    Receive and verify Stripe webhook events.
    Handles checkout.session.completed to confirm payment server-side.
    """
    webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
    payload = await request.body()

    if webhook_secret and stripe_signature:
        _stripe = _get_stripe()
        try:
            event = _stripe.Webhook.construct_event(
                payload, stripe_signature, webhook_secret
            )
        except _stripe.error.SignatureVerificationError:
            logger.warning('Stripe webhook signature verification failed')
            raise HTTPException(400, 'Invalid signature')
    else:
        # No secret configured — reject rather than accept unverified events.
        # Set STRIPE_WEBHOOK_SECRET in the environment to enable webhooks.
        logger.error('Stripe webhook received but STRIPE_WEBHOOK_SECRET is not configured — rejecting')
        raise HTTPException(400, 'Webhook secret not configured — cannot verify event')

    event_type = event.get('type') if isinstance(event, dict) else event.type

    if event_type == 'checkout.session.completed':
        session = event['data']['object'] if isinstance(event, dict) else event.data.object
        customer_email = (
            session.get('customer_details', {}).get('email')
            if isinstance(session, dict)
            else getattr(getattr(session, 'customer_details', None), 'email', None)
        )
        session_id = session.get('id') if isinstance(session, dict) else session.id
        stripe_customer_id = (
            session.get('customer') if isinstance(session, dict)
            else getattr(session, 'customer', None)
        )
        stripe_subscription_id = (
            session.get('subscription') if isinstance(session, dict)
            else getattr(session, 'subscription', None)
        )
        # Derive billing_period from metadata or default to monthly
        metadata = (
            session.get('metadata', {}) if isinstance(session, dict)
            else getattr(session, 'metadata', {}) or {}
        )
        billing_period = metadata.get('billing_period', 'monthly')

        logger.info('Checkout completed: session=%s email=%s', session_id, customer_email)

        if session_id and customer_email:
            existing = get_subscription_by_stripe_session(session_id)
            if existing:
                logger.info(
                    'Duplicate webhook — subscription already exists for session=%s, skipping',
                    session_id,
                )
                return {'received': True, 'status': 'already_processed'}

            try:
                create_subscription(
                    stripe_session_id=session_id,
                    customer_email=customer_email,
                    plan='pro',
                    billing_period=billing_period,
                    stripe_customer_id=stripe_customer_id,
                    stripe_subscription_id=stripe_subscription_id,
                )
                logger.info('Subscription created for session=%s email=%s', session_id, customer_email)
            except Exception as exc:
                logger.error('Failed to persist subscription for session=%s: %s', session_id, exc)

    elif event_type == 'customer.subscription.deleted':
        # Stripe fires this when a subscription is cancelled (immediately or at period end).
        # Mark the local subscription record as cancelled so access is revoked promptly.
        sub_obj = event['data']['object'] if isinstance(event, dict) else event.data.object
        stripe_sub_id = (
            sub_obj.get('id') if isinstance(sub_obj, dict) else getattr(sub_obj, 'id', None)
        )
        logger.info('Subscription cancelled: stripe_subscription_id=%s', stripe_sub_id)
        if stripe_sub_id:
            try:
                updated = cancel_subscription_by_stripe_id(stripe_sub_id)
                if updated:
                    logger.info('Subscription marked cancelled: stripe_subscription_id=%s', stripe_sub_id)
                else:
                    logger.warning(
                        'No active subscription found to cancel for stripe_subscription_id=%s', stripe_sub_id
                    )
            except Exception as exc:
                logger.error(
                    'Failed to cancel subscription for stripe_subscription_id=%s: %s', stripe_sub_id, exc
                )

    return {'received': True}
