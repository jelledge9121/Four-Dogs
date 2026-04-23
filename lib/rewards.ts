export type RewardDefinition = {
  id: string;
  cost: number;
  title: string;
  description: string;
  host_note?: string;
  customer_note?: string;
};

export const REWARDS: RewardDefinition[] = [
  {
    id: 'bonus-card-or-trivia-2',
    cost: 5,
    title: '1 Extra Bingo Card or +2 Trivia Points',
    description: 'Choose one: one extra music bingo card OR +2 trivia points.',
  },
  {
    id: 'double-bonus-card-or-trivia-4',
    cost: 10,
    title: '2 Extra Bingo Cards or +4 Trivia Points',
    description: 'Choose one: two extra music bingo cards OR +4 trivia points.',
  },
  {
    id: 'free-appetizer',
    cost: 50,
    title: 'Free Appetizer',
    description: 'Redeem for one free appetizer.',
  },
  {
    id: 'free-drink-id-required',
    cost: 75,
    title: 'Free Alcoholic Drink',
    description: 'Host must verify customer ID before fulfillment.',
    host_note: '🚨 ID CHECK REQUIRED: verify government-issued ID before serving this reward.',
    customer_note: 'Show this to the host. A valid ID check is required before this drink can be served.',
  },
  {
    id: 'four-dogs-shirt',
    cost: 100,
    title: 'Free Four Dogs T-Shirt (Blue or Green)',
    description: 'Host approval required, then customer contacts Joey / Four Dogs for fulfillment.',
    host_note:
      'After approval, explicitly tell customer: "Contact Joey / Four Dogs for shirt fulfillment" and record color choice (Blue or Green).',
    customer_note:
      'After host approval, contact Joey / Four Dogs directly to fulfill your shirt. Tell them your color choice: Blue or Green.',
  },
];

export function buildRewardSnapshot(totalPoints: number) {
  const available_rewards = REWARDS.filter((reward) => reward.cost <= totalPoints);
  const locked_rewards = REWARDS.filter((reward) => reward.cost > totalPoints);
  const next = locked_rewards[0] ?? null;

  return {
    available_rewards,
    locked_rewards,
    next_reward: next
      ? {
          target_points: next.cost,
          points_to_unlock: Math.max(0, next.cost - totalPoints),
          reward: next,
        }
      : null,
  };
}
