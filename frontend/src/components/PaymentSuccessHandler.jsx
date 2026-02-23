import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { trackPaymentSuccess } from '../services/activityTrackingService';
import { verifyPayment } from '../services/paymentService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function PaymentSuccessHandler() {
  const processedSessions = useRef(new Set());

  useEffect(() => {
    handlePaymentCallback();
  }, []);

  const handlePaymentCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const paymentStatus = params.get('payment');

    if (paymentStatus !== 'success' || !sessionId) return;
    if (processedSessions.current.has(sessionId)) return;

    processedSessions.current.add(sessionId);

    // Get current registered user (will be null for guests)
    const { data: { user } } = await supabase.auth.getUser();

    // ✅ FIX: Detect guest from localStorage (restored by App.jsx detectGuestSession)
    const guestId = localStorage.getItem('guest_id') || localStorage.getItem('guestId') || '';
    const isGuest = guestId.startsWith('guest_');

    console.log('💳 PaymentSuccessHandler:', { 
      sessionId: sessionId?.slice(0, 20), 
      hasUser: !!user, 
      isGuest, 
      guestId: guestId?.slice(0, 30) 
    });

    try {
      // 1. Verify payment with Stripe backend (works for both registered & guest)
      const result = await verifyPayment(sessionId);

      if (result.success) {
        console.log('✅ Payment verified & stored');

        if (user) {
          // ── REGISTERED USER: log activity ──────────────────────────
          await trackPaymentSuccess(user.id, sessionId, {
            amount: 999,
            currency: 'usd',
            payment_status: 'completed'
          });
          console.log('✅ Registered user payment activity logged');

        } else if (isGuest) {
          // ── GUEST USER: update guest_users row via backend ──────────
          // verifyPayment() already calls GuestService.save_payment() on the backend
          // when it detects a guest user_id in the Stripe session metadata.
          // This explicit call below is a safety net in case the metadata lookup fails.
          try {
            const resp = await fetch(`${API_URL}/api/guest/payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                guest_id: guestId,
                payment_data: {
                  stripe_session_id: sessionId,
                  payment_status: 'completed',
                  // plan_name and amount will be filled by backend from Stripe session
                }
              })
            });
            const guestResult = await resp.json();
            if (guestResult.success) {
              console.log('✅ Guest payment status updated in DB');
            } else {
              console.warn('⚠️ Guest payment DB update returned:', guestResult);
            }
          } catch (guestErr) {
            // Non-blocking — payment already verified, this is just DB bookkeeping
            console.error('⚠️ Guest payment DB update failed (non-blocking):', guestErr);
          }

        } else {
          console.warn('⚠️ Payment verified but no user or guest session found for activity logging');
        }

      } else {
        console.warn('⚠️ Payment verification incomplete — result:', result);
      }

    } catch (err) {
      console.error('❌ Payment processing failed', err);
    }
  };

  return null;
}

export default PaymentSuccessHandler;