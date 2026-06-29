import { createElement, type ReactElement } from "react";
import RaffleEndedEmail, {
  type RaffleEndedEmailProps,
} from "./RaffleEndedEmail";
import WinnerEmail, { type WinnerEmailProps } from "./WinnerEmail";

export interface EmailTemplateRegistry {
  Winner: WinnerEmailProps;
  RaffleEnded: RaffleEndedEmailProps;
}

const templateFactories: {
  [K in keyof EmailTemplateRegistry]: (
    props: EmailTemplateRegistry[K],
  ) => ReactElement;
} = {
  Winner: (props) => createElement(WinnerEmail, props),
  RaffleEnded: (props) => createElement(RaffleEndedEmail, props),
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
