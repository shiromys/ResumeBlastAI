import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const stripePromise = loadStripe(STRIPE_PUBLIC_KEY);

// ✅ UPDATED: Added priceId and amount parameters
export const initiateCheckout = async (user, priceId, amount) => {
  const stripe = await stripePromise;

  const response = await fetch(`${API_URL}/api/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      user_id: user.id,
      plan: user.plan,
      // Send disclaimer status to backend
      disclaimer_accepted: user.disclaimer_accepted,
      // ✅ NEW: Passing Stripe price ID and amount to backend
      price_id: priceId,
      amount: amount
    })
  });

  const session = await response.json();
  
  if (session.error) {
    throw new Error(session.error);
  }

  // Redirect to Stripe
  if (session.url) {
      window.location.href = session.url;
  } else {
      const result = await stripe.redirectToCheckout({
        sessionId: session.id
      });

      if (result.error) {
        throw new Error(result.error.message);
      }
  }
};

export const verifyPayment = async (sessionId) => {
  const response = await fetch(`${API_URL}/api/payment/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });

  return response.json();
};