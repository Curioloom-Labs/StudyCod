#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n;
    if (!(std::cin >> n)) return 0;
    std::vector<long long> values(n);
    for (long long& value : values) std::cin >> value;
    long long current = values[0], best = values[0];
    int start = 0, bestLeft = 0, bestRight = 0;
    for (int i = 1; i < n; ++i) {
        if (values[i] > current + values[i]) { current = values[i]; start = i; }
        else current += values[i];
        if (current > best) { best = current; bestLeft = start; bestRight = i; }
    }
    std::cout << best << ' ' << bestLeft + 1 << ' ' << bestRight + 1 << '\n';
}
