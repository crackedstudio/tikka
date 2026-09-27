export interface RaffleFormData {
  title: string;
  description: string;
  image: File | null;
  images: File[];
  pricePerTicket: number;
  totalTickets: number;
  duration: {
    days: number;
    hours: number;
  };
}

export interface CreateRaffleStep {
  id: string;
  title: string;
  icon: string;
  completed: boolean;
  active: boolean;
}

export interface ProgressStepperProps {
  steps: CreateRaffleStep[];
  currentStep: number;
}

export interface StepComponentProps {
  formData: RaffleFormData;
  updateFormData: (data: Partial<RaffleFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export interface LivePreviewProps {
  formData: RaffleFormData;
}
