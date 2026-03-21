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
"""
