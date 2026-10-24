import sys


def main() -> None:
    data = list(map(int, sys.stdin.buffer.read().split()))
    if not data:
        return
    n = data[0]
    values = data[1:1 + n]
    current = best = values[0]
    start = best_left = best_right = 0
    for index in range(1, n):
        if values[index] > current + values[index]:
            current = values[index]
            start = index
        else:
            current += values[index]
        if current > best:
            best = current
            best_left, best_right = start, index
    print(best, best_left + 1, best_right + 1)


if __name__ == "__main__":
    main()
