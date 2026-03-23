"""
NGW Closed-Loop Learning System
================================
Connects production analytics → failure clusters → candidate proposals
→ sandbox evaluation → human review → release attribution → monitoring.

Modules:
  ingestion      — analytics → failure cluster detection
  auto_candidate — failure cluster → candidate proposal generation
  sandbox_eval   — candidate safety evaluation against Gold Set
  monitoring     — post-release metric tracking and regression alerting
  knowledge      — pattern knowledge base, signal quality weighting, MIN_SIGNALS
  ci_gate        — signal-sufficiency + benchmark-delta CI gate with risk tiers
  revenue        — BusinessMetrics, ConversionScenario, 30-day projection
"""
