import { createElement, type ReactElement } from "react";
import RaffleEndedEmail, {
  type RaffleEndedEmailProps,
} from "./RaffleEndedEmail";
import WinnerEmail, { type WinnerEmailProps } from "./WinnerEmail";
import RaffleCancelledEmail, { type RaffleCancelledEmailProps } from "./RaffleCancelledEmail";

export interface EmailTemplateRegistry {
  Winner: WinnerEmailProps;
  RaffleEnded: RaffleEndedEmailProps;
  RaffleCancelled: RaffleCancelledEmailProps;
}

const templateFactories: {
  [K in keyof EmailTemplateRegistry]: (
    props: EmailTemplateRegistry[K],
  ) => ReactElement;
} = {
  Winner: (props) => createElement(WinnerEmail, props),
  RaffleEnded: (props) => createElement(RaffleEndedEmail, props),
  RaffleCancelled: (props) => createElement(RaffleCancelledEmail, props),
};

export type EmailTemplateName = keyof EmailTemplateRegistry;

export function isEmailTemplateName(
  templateName: string,
): templateName is EmailTemplateName {
  return templateName in templateFactories;
}

export function renderEmailTemplate<K extends EmailTemplateName>(
  templateName: K,
  context: EmailTemplateRegistry[K],
): ReactElement {
  return templateFactories[templateName](context);
}
