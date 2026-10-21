import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

const faqs = [
  {
    q: 'How do I place an order?',
    a: 'Scan the QR code on your table → Browse the menu → Add items to your cart → Click the cart button → Verify your email via OTP → Select a payment method → Click "Place Order". Your order will be sent to the kitchen immediately!',
  },
  {
    q: 'How do I add items to my cart?',
    a: 'On the menu page, click the "+ Add" button on any food item. You can increase or decrease the quantity using the "+" and "−" controls. All selected items are saved to your cart automatically.',
  },
  {
    q: 'How do I verify using OTP?',
    a: 'On the Cart page, enter your Full Name and Email Address, then click "Send OTP". A 6-digit code will be sent to your email. Enter that code and click "Verify". Once verified, payment methods will be unlocked.',
  },
  {
    q: 'When do payment methods become available?',
    a: 'Payment methods (Cash on Delivery and Online Payment) are locked until you successfully verify your email via OTP. After verification, they unlock instantly — no page refresh needed.',
  },
  {
    q: 'What is Estimated Delivery Time?',
    a: 'The Estimated Delivery Time (shown in the cart) is an AI-powered prediction of how long your order will take to be prepared and delivered to your table. It is calculated based on your items and the current kitchen workload.',
  },
  {
    q: 'What does Kitchen Load mean?',
    a: '"Kitchen Load" indicates how busy the kitchen currently is: Low means orders are being processed quickly, Medium means slightly longer wait, High means the kitchen is very busy and your order may take extra time. This is updated in real time.',
  },
  {
    q: 'How do I track my order?',
    a: 'After placing your order, you will be taken to the Order Tracking page automatically. You will see a live progress bar showing the current status: Pending → Paid / Confirmed → Preparing → Ready → Completed.',
  },
  {
    q: 'What do Pending, Paid, Preparing, Ready, and Completed mean?',
    a: (
      <ul className="space-y-1 list-none">
        <li><strong>Pending</strong> – Order received, awaiting payment confirmation.</li>
        <li><strong>Paid / Confirmed</strong> – Payment confirmed, order queued for preparation.</li>
        <li><strong>Preparing</strong> – The kitchen is currently preparing your food.</li>
        <li><strong>Ready</strong> – Your order is ready! Head to the counter to collect it.</li>
        <li><strong>Completed</strong> – Order has been collected. Enjoy your meal! 🎉</li>
      </ul>
    ),
  },
  {
    q: 'How will I know when my order is ready?',
    a: 'The order tracking page updates in real time using live data. When your order status changes to "Ready", the page will show a prominent green notification. Please keep the tracking page open for live updates.',
  },
  {
    q: 'Where do I collect my order?',
    a: 'When your order status shows "Ready", please proceed to the canteen counter to collect your food. A staff member will hand you your order.',
  },
];

const FAQItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#E7E5E4] dark:border-[#383330] rounded-2xl overflow-hidden transition-colors">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white dark:bg-[#1E1C1B] hover:bg-[#FFF8F2]/50 dark:hover:bg-[#2A2624] transition-colors cursor-pointer"
      >
        <span className="text-xs font-bold text-[#171717] dark:text-zinc-100 pr-4">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#E85D2A] shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#78716C] dark:text-zinc-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 bg-[#FFF8F2]/30 dark:bg-[#25201D] text-xs text-[#78716C] dark:text-zinc-300 leading-relaxed border-t border-[#E7E5E4] dark:border-[#383330]">
          <div className="pt-3">{a}</div>
        </div>
      )}
    </div>
  );
};

const FAQModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] bg-white dark:bg-[#18181B] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden border border-transparent dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E7E5E4] dark:border-zinc-800 shrink-0 bg-white dark:bg-[#18181B]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E85D2A] to-[#FB923C] flex items-center justify-center text-white shadow-md">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-[#171717] dark:text-white leading-none">Help & FAQs</h2>
              <p className="text-[10px] text-[#78716C] dark:text-zinc-400 mt-0.5">How to order at the ZOVIKPOS Canteen Kiosk</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-[#FFF8F2] dark:bg-zinc-800 text-[#E85D2A] dark:text-orange-400 hover:bg-[#E85D2A] hover:text-white rounded-xl transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Complete ordering journey */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#E85D2A] via-[#F97316] to-[#FB923C] text-white shrink-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-orange-200 mb-2">Complete Ordering Journey</p>
          <div className="flex items-center flex-wrap gap-1 text-[10px] font-bold">
            {[
              'Browse Menu',
              'Add to Cart',
              'Open Cart',
              'Check ETA',
              'Verify Email (OTP)',
              'Select Payment',
              'Place Order',
              'Track Order',
              'Order Ready',
              'Collect & Enjoy 🎉',
            ].map((step, idx, arr) => (
              <React.Fragment key={step}>
                <span className="bg-white/20 px-2 py-0.5 rounded-full">{step}</span>
                {idx < arr.length - 1 && <span className="text-orange-300">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* FAQ list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3 bg-[#FAF9F7] dark:bg-[#121212]">
          {faqs.map((faq, idx) => (
            <FAQItem key={idx} q={faq.q} a={faq.a} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E7E5E4] dark:border-zinc-800 shrink-0 text-center bg-white dark:bg-[#18181B]">
          <p className="text-[10px] text-[#78716C] dark:text-zinc-400">
            Still have questions? Ask the canteen staff for assistance.
          </p>
          <button
            onClick={onClose}
            className="mt-3 px-6 py-2.5 bg-[#E85D2A] text-white rounded-xl text-xs font-bold hover:bg-[#D94E1B] transition-all cursor-pointer shadow-md"
          >
            Got it, close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FAQModal;
