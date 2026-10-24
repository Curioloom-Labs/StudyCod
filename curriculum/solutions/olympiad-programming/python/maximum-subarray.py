import sys


def main() -> None:
    data = list(map(int, sys.stdin.buffer.read().split()))
    if not data:
        return
    n = data[0]
    values = data[1:1 + n]
    best = values[0]
    for left in range(n):
        current = 0
        for right in range(left, n):
            current += values[right]
            if current > best:
                best = current
    print(best)


if __name__ == "__main__":
    main()
