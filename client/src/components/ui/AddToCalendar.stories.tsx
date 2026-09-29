import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import AddToCalendar, { type AddToCalendarProps } from "./AddToCalendar";
import {
  generateIcs,
  googleCalendarUrl,
  outlookCalendarUrl,
  downloadIcsFile,
} from "../../utils/calendarUtils";
import { logger } from "../../utils/logger";

const meta: Meta<typeof AddToCalendar> = {
  title: "UI/AddToCalendar",
  component: AddToCalendar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Provides calendar integration for raffle end times. Supports Google Calendar, Outlook, and .ics file download with full ARIA accessibility and i18n support.",
      },
    },
  },
  argTypes: {
    title: { control: "text" },
    endTimeUnix: { control: "number" },
    url: { control: "text" },
    location: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof AddToCalendar>;

const sampleEndTime = Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000);

export const Default: Story = {
  args: {
    title: "Luxury Watch Raffle",
    endTimeUnix: sampleEndTime,
    url: "https://tikka.example.com/raffle/123",
  },
};

/** Example 1: Basic Usage in a Raffle Card */
export const BasicRaffleCard: Story = {
  render: () => {
    const endTime = Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000);
    const raffleUrl = "https://tikka.example.com/raffle/123";

    return (
      <div className="border border-gray-200 dark:border-white/10 p-5 rounded-2xl max-w-sm bg-white dark:bg-[#11172E] shadow-sm">
        <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">Luxury Watch Raffle</h3>
        <p className="text-sm text-gray-500 mb-4">Join our exclusive raffle for a luxury watch!</p>
        <AddToCalendar title="Luxury Watch Raffle" endTimeUnix={endTime} url={raffleUrl} />
      </div>
    );
  },
};

/** Example 2: With Location */
export const WithLocation: Story = {
  render: () => {
    const endTime = Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000);
    const raffleUrl = "https://tikka.example.com/raffle/456";

    return (
      <div className="border border-gray-200 dark:border-white/10 p-5 rounded-2xl max-w-sm bg-white dark:bg-[#11172E] shadow-sm">
        <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">Real Estate Raffle</h3>
        <p className="text-sm text-gray-500 mb-3">Live in New York City</p>
        <AddToCalendar
          title="Real Estate Raffle - Grand Prize Draw"
          endTimeUnix={endTime}
          url={raffleUrl}
          location="New York, NY"
        />
      </div>
    );
  },
};

/** Example 3: In RafflePage Sidebar (Realistic Integration) */
export const RafflePageSidebar: Story = {
  render: () => {
    const raffle = {
      id: 789,
      title: "Supercar Giveaway",
      end_time: "2026-11-30T18:00:00Z",
      location: "Miami, FL",
    };
    const endTimeUnix = Math.floor(new Date(raffle.end_time).getTime() / 1000);
    const raffleUrl = `https://tikka.example.com/raffle/${raffle.id}`;

    return (
      <div className="p-6 border border-gray-200 dark:border-white/10 rounded-2xl max-w-md bg-white dark:bg-[#11172E]">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{raffle.title}</h2>
          <div className="border-t border-gray-100 dark:border-white/10 pt-4">
            <AddToCalendar
              title={raffle.title}
              endTimeUnix={endTimeUnix}
              url={raffleUrl}
              location={raffle.location}
              className="mt-2"
            />
          </div>
        </div>
      </div>
    );
  },
};

/** Example 4: Standalone URL Generation */
export const StandaloneUrlGeneration: Story = {
  render: () => {
    const title = "Premium Watch Raffle";
    const endDate = new Date("2026-12-31T23:59:59Z");
    const raffleUrl = "https://tikka.example.com/raffle/789";
    const location = "Online Event";

    const googleUrl = googleCalendarUrl(title, endDate, raffleUrl, location);
    const outlookUrl = outlookCalendarUrl(title, endDate, raffleUrl, location);

    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Direct Calendar Links:</h3>
        <div className="flex gap-4">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-pink-600 hover:underline"
          >
            Add to Google Calendar &rarr;
          </a>
          <a
            href={outlookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-pink-600 hover:underline"
          >
            Add to Outlook &rarr;
          </a>
        </div>
      </div>
    );
  },
};

/** Example 5: Standalone ICS Download */
export const StandaloneIcsDownload: Story = {
  render: () => {
    const title = "Premium Watch Raffle";
    const endDate = new Date("2026-12-31T23:59:59Z");
    const raffleUrl = "https://tikka.example.com/raffle/789";

    const handleDownload = () => {
      downloadIcsFile(title, endDate, raffleUrl);
    };

    return (
      <button
        onClick={handleDownload}
        className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-sm font-medium transition-colors"
      >
        Download Calendar Event (.ics)
      </button>
    );
  },
};

/** Example 6: Custom Integration */
export const CustomCalendarIntegration: Story = {
  render: () => {
    const title = "Luxury Car Raffle";
    const endDate = new Date("2026-12-31T23:59:59Z");
    const raffleUrl = "https://tikka.example.com/raffle/999";
    const location = "Virtual Event";

    const handleCustomAction = () => {
      const icsContent = generateIcs(title, endDate, raffleUrl, location);
      logger.info("Generated ICS content:", { length: icsContent.length });
      alert(`Generated ICS payload with length: ${icsContent.length} chars`);
    };

    return (
      <button
        onClick={handleCustomAction}
        className="px-4 py-2 border border-gray-300 dark:border-white/20 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
      >
        Inspect ICS Payload
      </button>
    );
  },
};

/** Example 7: Mobile-Optimized Usage */
export const MobileOptimized: Story = {
  render: () => {
    const endTime = Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000);
    const raffleUrl = "https://tikka.example.com/raffle/mobile";

    return (
      <div className="max-w-[320px] border border-gray-200 dark:border-white/10 p-4 rounded-2xl bg-white dark:bg-[#11172E]">
        <h4 className="font-bold text-base mb-2">Mobile Raffle View</h4>
        <AddToCalendar
          title="Exclusive Mobile Raffle"
          endTimeUnix={endTime}
          url={raffleUrl}
          className="w-full"
        />
      </div>
    );
  },
};

/** Example 8: Accessible Implementation */
export const AccessibleImplementation: Story = {
  render: () => {
    const endTime = Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000);
    const raffleUrl = "https://tikka.example.com/raffle/accessible";

    return (
      <div className="p-4 border border-gray-200 dark:border-white/10 rounded-2xl max-w-sm">
        <h4 className="font-semibold text-sm mb-1">Luxury Watch Raffle</h4>
        <p className="text-xs text-gray-500 mb-3">Ends: December 31, 2026</p>
        <AddToCalendar title="Luxury Watch Raffle" endTimeUnix={endTime} url={raffleUrl} />
      </div>
    );
  },
};

/** Example 9: Dark Mode Support */
export const DarkModeSupport: Story = {
  render: () => {
    const endTime = Math.floor(new Date("2026-12-31T23:59:59Z").getTime() / 1000);
    const raffleUrl = "https://tikka.example.com/raffle/dark";

    return (
      <div className="dark bg-slate-900 p-8 rounded-2xl text-white max-w-sm">
        <h3 className="text-lg font-bold mb-2">Dark Mode Raffle Card</h3>
        <p className="text-sm text-gray-400 mb-4">Adapts automatically to dark mode tokens.</p>
        <AddToCalendar title="Raffle Event" endTimeUnix={endTime} url={raffleUrl} />
      </div>
    );
  },
};

/** Example 10: Error Handling */
export const ErrorHandling: Story = {
  render: () => {
    const title = "Raffle Event";
    const endDate = new Date("2026-12-31T23:59:59Z");
    const raffleUrl = "https://tikka.example.com/raffle/error-handling";

    const handleSafeDownload = () => {
      try {
        downloadIcsFile(title, endDate, raffleUrl);
      } catch (error) {
        logger.error("Failed to download calendar:", error);
        alert("Could not download calendar file. Please try again.");
      }
    };

    return (
      <button
        onClick={handleSafeDownload}
        className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-sm font-medium transition-colors"
      >
        Download Calendar (Safe Handler)
      </button>
    );
  },
};

/** Example 11: Multiple Raffles List */
export const MultipleRafflesList: Story = {
  render: () => {
    const raffles = [
      { id: 1, title: "Grand Gold Raffle", endTime: sampleEndTime },
      { id: 2, title: "Diamond Ring Raffle", endTime: sampleEndTime + 86400 },
      { id: 3, title: "Sports Car Raffle", endTime: sampleEndTime + 172800 },
    ];

    return (
      <div className="space-y-3 max-w-md">
        {raffles.map((raffle) => (
          <div
            key={raffle.id}
            className="flex items-center justify-between p-3 border border-gray-200 dark:border-white/10 rounded-xl"
          >
            <span className="font-medium text-sm text-gray-900 dark:text-white">
              {raffle.title}
            </span>
            <AddToCalendar
              title={raffle.title}
              endTimeUnix={raffle.endTime}
              url={`https://tikka.example.com/raffle/${raffle.id}`}
            />
          </div>
        ))}
      </div>
    );
  },
};

/** Example 12: Internationalization Support */
export const InternationalizationSupport: Story = {
  render: () => {
    return (
      <div className="space-y-4 max-w-sm p-4 border border-gray-200 dark:border-white/10 rounded-2xl">
        <p className="text-xs text-gray-500">
          Component text translates automatically via i18n keys: <code>raffle.addToCalendar</code> and <code>raffle.calendarOptions</code>.
        </p>
        <AddToCalendar
          title="Rifa de Reloj de Lujo"
          endTimeUnix={sampleEndTime}
          url="https://tikka.example.com/raffle/i18n"
        />
      </div>
    );
  },
};
