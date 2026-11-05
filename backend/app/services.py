"""Application composition root. Domain modules have no dependency on HTTP routing."""
from .delivery import DeliveryMixin
from .dispatcher import DispatcherMixin
from .intake import IntakeMixin
from .queries import QueryMixin
from .service_base import ServiceBase
from .workflow import WorkflowMixin


class Services(IntakeMixin, WorkflowMixin, DeliveryMixin, DispatcherMixin, QueryMixin, ServiceBase):
    pass
