"""HTTP endpoint for the island calculator's Currency mode."""

from fastapi import APIRouter, HTTPException

from .currency_service import CurrencyError, get_rates

router = APIRouter(prefix="/api/currency", tags=["currency"])


@router.get("")
def currency_rates() -> dict:
    """Returns the daily USD table, from cache first and the network only if needed."""
    try:
        return get_rates()
    except CurrencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
