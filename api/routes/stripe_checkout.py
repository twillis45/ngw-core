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
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel

from db.database import create_subscription

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

@router.post('/stripe/create-checkout-session', response_model=CheckoutSessionResponse)
async def create_checkout_session(body: CheckoutSessionRequest):
    """Create a Stripe Checkout Session and return the hosted checkout URL."""

    if body.plan != 'pro':
        raise HTTPException(400, f'Unsupported plan: {body.plan}')

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
        # No secret configured — accept without verification (dev only)
        import json
        event = json.loads(payload)

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
            try:
                create_subscription(
                    stripe_session_id=session_id,
                    customer_email=customer_email,
                    plan='pro',
                    billing_period=billing_period,
                    stripe_customer_id=stripe_customer_id,
                    stripe_subscription_id=stripe_subscription_id,
                )
                logger.info('Subscription persisted for session=%s', session_id)
            except Exception as exc:
                logger.error('Failed to persist subscription for session=%s: %s', session_id, exc)

    return {'received': True}
