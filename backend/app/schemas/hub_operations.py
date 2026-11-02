from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class FarmerHubOptionResponse(BaseModel):
    id: UUID
    name: str
    address: str
    farmer_id: UUID | None = None
    facility_type: str = "PLATFORM"
    is_owned: bool = False


class StockDeliveryCreate(BaseModel):
    hub_id: UUID
    listing_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class StockDeliveryReceiveRequest(BaseModel):
    received_quantity: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=3)


class StockDeliveryResponse(BaseModel):
    id: UUID
    hub_id: UUID
    hub_name: str
    farmer_name: str
    listing_id: UUID
    crop_name: str
    unit: str
    quantity: Decimal
    status: str
    created_at: datetime
    received_at: datetime | None


class HubStaffHubResponse(BaseModel):
    id: UUID
    name: str
    address: str


class HubOrderItemResponse(BaseModel):
    crop_name: str
    quantity: Decimal
    unit: str


class HubOrderToPackResponse(BaseModel):
    id: UUID
    consumer_name: str
    status: str
    total_amount: Decimal
    created_at: datetime
    consumer_address: str | None = None
    consumer_city: str | None = None
    farmer_name: str | None = None
    items: list[HubOrderItemResponse]


class HubShipmentResponse(BaseModel):
    id: UUID
    order_id: UUID
    consumer_name: str
    status: str
    total_amount: Decimal
    promised_window_start: datetime
    promised_window_end: datetime
    rider_name: str | None = None
    rider_vehicle: str | None = None
    dropoff_address: str | None = None
    items: list[HubOrderItemResponse]


class HubOperationsOverviewResponse(BaseModel):
    hub: HubStaffHubResponse
    incoming_deliveries: list[StockDeliveryResponse]
    orders_to_pack: list[HubOrderToPackResponse]
    packing_shipments: list[HubShipmentResponse]
    ready_shipments: list[HubShipmentResponse] = []
    completed_shipments: list[HubShipmentResponse] = []
