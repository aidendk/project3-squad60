(function () {
    const REWARDS = {
        topping: { id: 'topping', label: 'Free topping', points: 50, discount: 0.75 },
        dollar: { id: 'dollar', label: '$1 off', points: 100, discount: 1 },
        three: { id: 'three', label: '$3 off', points: 200, discount: 3 }
    };

    const { roundMoney } = typeof module !== 'undefined' && module.exports
        ? require('./money') : globalThis.shopMoney;

    function isCustomerCode(value) {
        return typeof value === 'string' && /^\d{4}$/.test(value);
    }

    function rewardList() {
        return ['topping', 'dollar', 'three'].map((id) => ({ ...REWARDS[id] }));
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

    const rewards = { rewardList, applyReward, isCustomerCode };
    if (typeof module !== 'undefined' && module.exports) module.exports = rewards;
    else globalThis.kioskRewards = rewards;
})();
