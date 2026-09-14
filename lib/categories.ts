// Fixed discovery categories. Keep aligned with the Category rows seeded by
// 20260914000000_fixed_bounty_categories.sql; task titles remain user-written.
export const bountyCategories = [
  "Academic", "Physical", "Errands", "Creative", "Tech", "Career", "Events",
] as const;

export const categoryTitleExamples: Record<string, string> = {
  Academic: "Help me understand integration by parts",
  Physical: "Help move a desk across campus",
  Errands: "Pick up a library book this afternoon",
  Creative: "Design a poster for our club event",
  Tech: "Help debug my personal website",
  Career: "Practice a product internship interview",
  Events: "Help set up our club welcome night",
};
