import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const LanguageSection = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("tikka-locale", lng);
    if (lng === "ar") {
      document.documentElement.setAttribute("dir", "rtl");
    } else {
      document.documentElement.setAttribute("dir", "ltr");
    }
  };

  return (
    <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <Globe className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Language
        </h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Select your preferred language for the interface.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => changeLanguage("en")}
          aria-label="Switch to English"
          aria-pressed={i18n.language === "en"}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            i18n.language === "en"
              ? "bg-[#FE3796] text-white"
              : "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"
          }`}
        >
          English
        </button>
        <button
          onClick={() => changeLanguage("es")}
          aria-label="Switch to Spanish"
          aria-pressed={i18n.language === "es"}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            i18n.language === "es"
              ? "bg-[#FE3796] text-white"
              : "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"
          }`}
        >
          Español
        </button>
        <button
          onClick={() => changeLanguage("ar")}
          aria-label="Switch to Arabic"
          aria-pressed={i18n.language === "ar"}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            i18n.language === "ar"
              ? "bg-[#FE3796] text-white"
              : "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"
          }`}
        >
          العربية
        </button>
      </div>
    </div>
  );
};

export default LanguageSection;