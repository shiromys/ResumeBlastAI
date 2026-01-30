import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { trackPaymentSuccess } from '../services/activityTrackingService'; // ✅ Import this
import { verifyPayment } from '../services/paymentService';

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

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    try {
      // 1. Verify Payment with Stripe
      const result = await verifyPayment(sessionId);

      if (result.success) {
        console.log('✅ Payment verified & stored');
        
        // 2. ✅ Log Activity via Backend (Bypasses RLS)
        if (user) {
            await trackPaymentSuccess(user.id, sessionId, {
                amount: 14900, // $149.00
                currency: 'usd',
                payment_status: 'completed'
            });
            console.log('✅ Payment activity logged to DB');
        }
      } else {
        console.warn('⚠️ Payment verification incomplete');
      }
    } catch (err) {
      console.error('❌ Payment processing failed', err);
    }
  };

  return null;
}

export default PaymentSuccessHandler;