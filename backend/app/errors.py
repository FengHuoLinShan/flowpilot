class FlowError(Exception):
    def __init__(self, code: str, message: str, *, status: int = 400, retryable: bool = False):
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable
        super().__init__(message)


class NeedsReview(FlowError):
    def __init__(self, code: str, message: str):
        super().__init__(code, message, status=409)
