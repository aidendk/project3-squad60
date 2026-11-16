(function () {
    const REWARDS = {
        FREE_TOPPING: { id: 'FREE_TOPPING', label: 'Free Topping ($0.75 off)', points: 75, discount: 0.75 },
        OFF_150: { id: 'OFF_150', label: '$1.50 Off Total', points: 150, discount: 1.5 },
        OFF_300: { id: 'OFF_300', label: '$3.00 Off Total', points: 300, discount: 3 },
        FREE_DRINK: { id: 'FREE_DRINK', label: 'Free Drink (up to $6.00)', points: 500, discount: 6 }
    };
    const REWARD_IDS = ['FREE_TOPPING', 'OFF_150', 'OFF_300', 'FREE_DRINK'];

    const { roundMoney } = typeof module !== 'undefined' && module.exports
        ? require('./money') : globalThis.shopMoney;

    function normalizePhone(value) {
        const digits = String(value ?? '').replace(/\D/g, '');
        return digits.length === 10 ? digits : '';
    }

    function rewardList() {
        return REWARD_IDS.map((id) => ({ ...REWARDS[id] }));
    }

    function availableRewards(balance) {
        return rewardList().filter((reward) => Number(balance) >= reward.points);
    }

    function pointsEarned(subtotal) {
        const base = Math.max(0, roundMoney(Number(subtotal) || 0));
        return Math.floor(base * 10);
    }

    // Empty reward spends nothing. Unknown reward is null so the caller can reject it.
    function applyReward(subtotal, rewardId) {
        if (rewardId == null || rewardId === '') {
            return { id: null, label: null, points: 0, discount: 0 };
        }
        const reward = REWARDS[rewardId];
        if (!reward) {
            return null;
        }
        const base = Math.max(0, roundMoney(subtotal));
        return {
            id: reward.id,
            label: reward.label,
            points: reward.points,
            discount: roundMoney(Math.min(reward.discount, base))
        };
    }

    const rewards = { rewardList, availableRewards, applyReward, pointsEarned, normalizePhone };
    if (typeof module !== 'undefined' && module.exports) module.exports = rewards;
    else globalThis.kioskRewards = rewards;
})();
