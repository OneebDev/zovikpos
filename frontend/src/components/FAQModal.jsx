import React, { useState } from 'react';
import { X, ChevronDown, HelpCircle, ScanLine, Utensils, ShoppingCart, ShieldCheck, MapPin } from 'lucide-react';
import ModalShell from './ui/ModalShell';

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

const FAQItem = ({ q, a, id }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-modal__item${open ? ' is-open' : ''}`}>
      <button
        id={`${id}-question`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="faq-modal__question"
        aria-expanded={open}
        aria-controls={`${id}-answer`}
      >
        <span className="faq-modal__question-text">{q}</span>
        <ChevronDown className="faq-modal__chevron" aria-hidden="true" />
      </button>
      <div
        id={`${id}-answer`}
        className="faq-modal__answer-grid"
        role="region"
        aria-labelledby={`${id}-question`}
        aria-hidden={!open}
      >
        <div className="faq-modal__answer-clip">
          <div className="faq-modal__answer">{a}</div>
        </div>
      </div>
    </div>
  );
};

const FAQModal = ({ onClose }) => {
  const journey = [
    ['Scan', ScanLine], ['Browse', Utensils], ['Cart', ShoppingCart], ['Verify', ShieldCheck], ['Track', MapPin],
  ];
  return (
    <ModalShell isOpen onClose={onClose} labelledBy="faq-modal-title" closeOnEscape className="customer-modal faq-modal">
      <header className="customer-modal__header faq-modal__header">
        <span className="customer-modal__icon"><HelpCircle aria-hidden="true" /></span>
        <div><h2 id="faq-modal-title">Help & FAQs</h2><p>How to order at the ZOVIKPOS Canteen Kiosk</p></div>
        <button type="button" onClick={onClose} className="customer-modal__close icon-btn" aria-label="Close help and FAQs"><X aria-hidden="true" /></button>
      </header>
      <div className="faq-modal__journey">
        <p>Complete Ordering Journey</p>
        <ol>{journey.map(([label, Icon]) => <li key={label}><span className="faq-modal__journey-node"><Icon aria-hidden="true" /></span><span className="faq-modal__journey-label">{label}</span></li>)}</ol>
      </div>
      <div className="customer-modal__body faq-modal__list">
        {faqs.map((faq, idx) => <FAQItem key={idx} id={`faq-item-${idx}`} q={faq.q} a={faq.a} />)}
      </div>
      <footer className="customer-modal__footer faq-modal__footer">
        <p>Still have questions? Ask the canteen staff for assistance.</p>
        <button type="button" onClick={onClose} className="customer-modal__button customer-modal__button--primary">Got it, close</button>
      </footer>
    </ModalShell>
  );
};

export default FAQModal;
