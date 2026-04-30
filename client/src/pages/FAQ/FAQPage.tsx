import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search } from 'lucide-react';
import { faqData } from './FAQContent';

const HighlightText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) {
    return <>{text}</>;
  }
  const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHighlight})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/30 text-gray-900 dark:text-yellow-100 rounded-sm px-1">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

const FAQItem = ({
  question,
  answer,
  id,
  searchQuery,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  id: string;
  searchQuery: string;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (location.hash === `#${id}`) {
      setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [location.hash, id]);

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-0" id={id} ref={itemRef}>
      <h3>
        <button
          type="button"
          id={`accordion-control-${id}`}
          aria-expanded={isOpen}
          aria-controls={`accordion-section-${id}`}
          onClick={onToggle}
          className="flex w-full items-center justify-between py-5 text-left font-medium text-gray-900 dark:text-white transition-all hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 rounded-lg"
        >
          <span>
            <HighlightText text={question} highlight={searchQuery} />
          </span>
          <svg
            className={`w-4 h-4 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
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
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed pb-5 pt-1">
            <HighlightText text={answer} highlight={searchQuery} />
          </p>
        </div>
      </div>
    </div>
  );
};

const FAQPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => {
    // Initial state check for hash
    const hashId = window.location.hash.replace('#', '');
    return hashId ? { [hashId]: true } : {};
  });

  // Keep open items in sync if hash changes externally
  useEffect(() => {
    const hashId = location.hash.replace('#', '');
    if (hashId && !openItems[hashId]) {
      setOpenItems((prev) => ({ ...prev, [hashId]: true }));
    }
  }, [location.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredFaqs = faqData.filter(
    (item) =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const isOpening = !prev[id];
      
      // Update hash to reflect state
      if (isOpening) {
        window.history.pushState(null, '', `#${id}`);
      } else if (location.hash === `#${id}`) {
        window.history.pushState(null, '', window.location.pathname + window.location.search);
      }
      
      return { ...prev, [id]: isOpening };
    });
  };

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqData.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
    })),
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>FAQ | Tikka</title>
        <script type="application/ld+json">
          {JSON.stringify(schemaData)}
        </script>
      </Helmet>

      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Help & FAQ</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Everything you need to know about Tikka and the Stellar ecosystem.
        </p>
      </header>
      
      <div className="mb-8 relative max-w-xl mx-auto">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors shadow-sm"
          placeholder="Search for answers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8">
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((item) => (
            <FAQItem
              key={item.id}
              question={item.question}
              answer={item.answer}
              id={item.id}
              searchQuery={searchQuery}
              isOpen={!!openItems[item.id] || (searchQuery.trim().length > 0 && filteredFaqs.length <= 3)}
              onToggle={() => toggleItem(item.id)}
            />
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400 text-lg">No questions found matching "{searchQuery}"</p>
            <button 
              onClick={() => setSearchQuery('')}
              className="mt-4 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
            >
              Clear search
            </button>
          </div>
        )}
      </div>
      
      <footer className="mt-12 text-center text-sm text-gray-500">
        Still have questions? <a href="mailto:support@tikka.com" className="text-blue-600 hover:underline transition-colors">Contact Support</a>
      </footer>
    </div>
  );
};

export default FAQPage;