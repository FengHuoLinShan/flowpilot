"""Deterministic business policy. Model output cannot approve, send, or set priority."""
from __future__ import annotations

from .schemas import Extraction

BUDGET_HIGH = {"CNY": 100_000, "USD": 20_000, "EUR": 20_000, "GBP": 15_000, "AUD": 25_000}


def classify(data: Extraction) -> dict:
    review = []
    if not data.name:
        review.append("缺少联系人姓名 / Missing contact name")
    if not data.company:
        review.append("缺少公司名称 / Missing company")
    if not data.email:
        review.append("缺少有效邮箱，无法起草可审批的邮件 / Missing valid email")
    if len(data.requirement.strip()) < 8:
        review.append("需求描述不足 / Insufficient requirement")
    if data.confidence < 0.7:
        review.append("提取置信度低于 0.70 / Extraction confidence below 0.70")
    if data.ambiguities:
        review.append("存在待确认信息 / Extracted facts contain ambiguities")
    if data.intent == "unknown":
        review.append("咨询目的不明确 / Intent is unknown")
    reasons = []
    tags = [data.intent]
    if data.budget is None:
        tags.append("budget_needed")
        reasons.append("未提供预算，跟进时需补充 / Budget will be requested in follow-up")
    high_budget = data.budget is not None and data.budget >= BUDGET_HIGH[data.currency]
    if high_budget:
        reasons.append(f"预算达到高优先级阈值 {BUDGET_HIGH[data.currency]:,} {data.currency} / High-budget threshold met")
        tags.append("high_budget")
    if data.urgency == "urgent":
        reasons.append("客户明确表达紧急时间需求 / Explicit urgent timeline")
        tags.append("urgent")
    if data.intent == "unrelated":
        priority, category, owner = "low", "unrelated", "人工分诊 / Triage"
        reasons.append("咨询与主营业务无关；仅归档，不生成邮件 / Unrelated inquiry: archive without drafting")
    elif data.intent == "support":
        priority, category, owner = ("high" if data.urgency == "urgent" else "normal"), "support", "客户成功 / Customer Success"
        reasons.append("售后请求分配至客户成功队列 / Support routed to customer success")
    elif data.intent == "partnership":
        priority, category, owner = "normal", "partnership", "业务合作 / Partnerships"
        reasons.append("合作需求分配至商务队列 / Partnership routed to business development")
    else:
        priority = "high" if high_budget or data.urgency == "urgent" else "normal"
        category, owner = "sales", "重点客户 / Key Accounts" if priority == "high" else "销售团队 / Sales"
        reasons.append("产品询价按预算及紧急程度分级 / Inquiry ranked by explicit budget and urgency")
    return {"category": category, "priority": priority, "owner": owner, "tags": tags,
            "reasons": reasons, "review_reasons": review, "needs_review": bool(review),
            "irrelevant": data.intent == "unrelated", "policy_version": "lead-policy-1.0",
            "rules": {"confidence_minimum": 0.7, "high_budget_threshold": BUDGET_HIGH[data.currency],
                      "budget_currency": data.currency, "external_send_requires_human": True}}
