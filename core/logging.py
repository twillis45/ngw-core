import logging

logger = logging.getLogger("ngw")

def log_engine(payload, result):
    logger.info({
        "payload": payload,
        "winner": result["selection"]["winner"]["system_id"]
    })
