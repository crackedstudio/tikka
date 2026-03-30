import React, { useState } from 'react';
import { faqData } from './FAQContent';

const FAQItem = ({ question, answer, id }: { question: string, answer: string, id: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <h3>
        <button
          type="button"
          id={`accordion-control-${id}`}
          aria-expanded={isOpen}
          aria-controls={`accordion-section-${id}`}
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between py-5 text-left font-medium text-gray-900 dark:text-white transition-all hover:text-blue-600"
        >
          <span>{question}</span>
          <svg
            className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h3>
      <div
        id={`accordion-section-${id}`}
        role="region"
        aria-labelledby={`accordion-control-${id}`}
        className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-5' : 'max-h-0'}`}
      >
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
          {answer}
        </p>
      </div>
    </div>
  );
};

const FAQPage = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Help & FAQ</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Everything you need to know about Tikka and the Stellar ecosystem.
        </p>
      </header>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8">
        {faqData.map((item) => (
          <FAQItem key={item.id} {...item} />
        ))}
      </div>
      
      <footer className="mt-12 text-center text-sm text-gray-500">
        Still have questions? <a href="mailto:support@tikka.com" className="text-blue-600 hover:underline">Contact Support</a>
      </footer>
    </div>
  );
};

export default FAQPage;