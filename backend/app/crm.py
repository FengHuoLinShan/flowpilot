from __future__ import annotations

import re
import unicodedata
from datetime import timedelta
from typing import Protocol

from sqlalchemy import select

from .db import Company, Contact, Event, Lead, Task, now
from .errors import NeedsReview


def normalize_name(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def normalize_email(value: str | None) -> str | None:
    return value.strip().casefold() if value else None


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    return digits or None


class CRMAdapter(Protocol):
    """Integration boundary; adapters must implement idempotent upserts and explicit results."""
    name: str

    def upsert(self, session, event: Event, extraction: dict, classification: dict) -> dict: ...


class BuiltinCRMAdapter:
    name = "builtin"

    def upsert(self, session, event: Event, extraction: dict, classification: dict) -> dict:
        # Test and real data have distinct unique-key namespaces.
        email, phone = normalize_email(extraction.get("email")), normalize_phone(extraction.get("phone"))
        by_email = session.scalar(select(Contact).where(Contact.email == email, Contact.is_test == event.is_test)) if email else None
        by_phone = session.scalar(select(Contact).where(Contact.phone == phone, Contact.is_test == event.is_test)) if phone else None
        if by_email and by_phone and by_email.id != by_phone.id:
            raise NeedsReview("CONTACT_IDENTITY_CONFLICT", "Email and phone match different contacts. Correct the source facts before continuing.")
        contact = by_email or by_phone
        normalized_company = normalize_name(extraction.get("company") or "待确认 / Unconfirmed")
        company = session.scalar(select(Company).where(Company.normalized_name == normalized_company, Company.is_test == event.is_test))
        if contact:
            if email and contact.email and email != contact.email:
                raise NeedsReview("CONTACT_EMAIL_CONFLICT", "Existing contact has a different email. Human correction is required before a merge.")
            if phone and contact.phone and phone != contact.phone:
                raise NeedsReview("CONTACT_PHONE_CONFLICT", "Existing contact has a different phone. Human correction is required before a merge.")
            old_company = session.get(Company, contact.company_id) if contact.company_id else None
            if old_company and old_company.normalized_name != normalized_company:
                raise NeedsReview("CONTACT_COMPANY_CONFLICT", "Existing contact belongs to a different company. Human correction is required.")
        company_created = company is None
        if company is None:
            company = Company(name=extraction.get("company") or "待确认 / Unconfirmed", normalized_name=normalized_company, is_test=event.is_test)
            session.add(company)
            session.flush()
        contact_created = contact is None
        if contact is None:
            contact = Contact(name=extraction.get("name") or "待确认 / Unconfirmed", email=email, phone=phone,
                              company_id=company.id, is_test=event.is_test)
            session.add(contact)
            session.flush()
        else:
            # Do not overwrite established identity with a model guess.
            contact.email = contact.email or email
            contact.phone = contact.phone or phone
            contact.company_id = contact.company_id or company.id
            contact.updated_at = now()
        lead = session.scalar(select(Lead).where(Lead.event_id == event.id))
        lead_created = lead is None
        if lead is None:
            lead = Lead(event_id=event.id, requirement=extraction["requirement"], priority=classification["priority"],
                        category=classification["category"])
            session.add(lead)
        lead.contact_id, lead.company_id = contact.id, company.id
        lead.requirement, lead.budget, lead.currency = extraction["requirement"], extraction.get("budget"), extraction["currency"]
        lead.priority, lead.category, lead.tags = classification["priority"], classification["category"], classification["tags"]
        lead.owner = classification["owner"]
        if classification["irrelevant"]:
            lead.status = "disqualified"
        elif not lead.status or lead.status == "disqualified":
            lead.status = "new"
        lead.updated_at = now()
        session.flush()
        task = session.scalar(select(Task).where(Task.event_id == event.id))
        task_created = False
        if not classification["irrelevant"]:
            if task is None:
                task = Task(event_id=event.id, lead_id=lead.id, title="确认需求并安排跟进 / Confirm requirements and follow up",
                            owner=classification["owner"], due_at=now() + timedelta(hours=4 if classification["priority"] == "high" else 24))
                session.add(task)
                session.flush()
                task_created = True
            else:
                task.owner = classification["owner"]
        elif task:
            task.status = "done"
        return {"adapter": self.name, "external_sync": False,
                "company_id": company.id, "company_action": "created" if company_created else "matched",
                "contact_id": contact.id, "contact_action": "created" if contact_created else "matched",
                "lead_id": lead.id, "lead_action": "created" if lead_created else "updated",
                "task_id": task.id if task else None, "task_action": "created" if task_created else "existing" if task else "not_required"}


class ExternalCRMAdapter:
    """Intentional future boundary, not an implemented HubSpot/GHL integration."""
    name = "external_not_implemented"

    def upsert(self, session, event, extraction, classification):
        raise NotImplementedError("External CRM adapters are not implemented. Use the real built-in CRM.")
