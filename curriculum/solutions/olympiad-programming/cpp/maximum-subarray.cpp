#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n;
    if (!(std::cin >> n)) return 0;
    std::vector<long long> values(n);
    for (long long& value : values) std::cin >> value;
    long long best = values[0];
    for (int left = 0; left < n; ++left) {
        long long current = 0;
        for (int right = left; right < n; ++right) {
            current += values[right];
            if (current > best) best = current;
        }
    }
    std::cout << best << '\n';
}
