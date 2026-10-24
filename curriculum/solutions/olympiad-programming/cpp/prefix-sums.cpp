#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n, q;
    if (!(std::cin >> n >> q)) return 0;
    std::vector<long long> prefix(n + 1, 0);
    for (int i = 0; i < n; ++i) {
        long long value;
        std::cin >> value;
        prefix[i + 1] = prefix[i] + value;
    }
    for (int i = 0; i < q; ++i) {
        int left, right;
        std::cin >> left >> right;
        std::cout << prefix[right] - prefix[left - 1];
        if (i + 1 < q) std::cout << '\n';
    }
}
