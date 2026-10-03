import { useState } from "react";
import { orderRequest } from "../services/api";

export default function ConsumerCheckout({ onBack }) {
	const [state, setState] = useState({ loading: false, message: "", error: "" });
	const checkout = () => {
		setState({ loading: true, message: "", error: "" });
		orderRequest("/orders", { method: "POST" }).then((order) => setState({ loading: false, message: `Order ${order.id.slice(0, 8)} created.`, error: "" })).catch((error) => setState({ loading: false, message: "", error: error.message }));
	};
	return <section className="detail-view checkout-page"><div className="consumer-screen-header"><button className="back-button" onClick={onBack}>← Back to cart</button><span className="eyebrow">Consumer checkout</span><h1>Review and place your order</h1><p>Totals and stock are verified by the server when you place the order.</p></div><div className="checkout-steps"><button className="done" type="button"><b>1</b><span>Cart</span></button><button className="active" type="button"><b>2</b><span>Review</span></button><button type="button"><b>3</b><span>Fulfillment</span></button><button type="button"><b>4</b><span>Confirmation</span></button></div><div className="checkout-panel consumer-panel"><h2>Order review</h2><p>Continue when your cart is ready. The backend calculates the final amount and validates available stock.</p><div className="choice-list"><label><input type="radio" checked readOnly /> <span>Server-verified checkout</span><small>Prices, quantities, fees, and totals come from the current cart.</small></label></div><button className="primary-button full-button" disabled={state.loading} onClick={checkout}>{state.loading ? "Placing order..." : "Place order"}</button>{state.message && <div className="success">{state.message}</div>}{state.error && <div className="error">{state.error}</div>}</div></section>;
}
