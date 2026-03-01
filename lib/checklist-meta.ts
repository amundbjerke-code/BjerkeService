import { ChecklistItemAnswer } from "@prisma/client";

export const checklistAnswerOptions: Array<{ value: ChecklistItemAnswer; label: string }> = [
  { value: ChecklistItemAnswer.JA, label: "Ja" },
  { value: ChecklistItemAnswer.NEI, label: "Nei" },
  { value: ChecklistItemAnswer.IKKE_RELEVANT, label: "Ikke relevant" }
];

export function getChecklistAnswerLabel(answer: ChecklistItemAnswer | null): string {
  if (!answer) {
    return "Ikke besvart";
  }
  const option = checklistAnswerOptions.find((item) => item.value === answer);
  return option?.label ?? answer;
}
