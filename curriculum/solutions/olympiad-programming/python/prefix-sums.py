import sys


def main() -> None:
    data = list(map(int, sys.stdin.buffer.read().split()))
    if not data:
        return
    n, q = data[0], data[1]
    values = data[2:2 + n]
    prefix = [0] * (n + 1)
    for index, value in enumerate(values):
        prefix[index + 1] = prefix[index] + value
    cursor = 2 + n
    answers = []
    for _ in range(q):
        left, right = data[cursor], data[cursor + 1]
        cursor += 2
        answers.append(str(prefix[right] - prefix[left - 1]))
    sys.stdout.write("\n".join(answers))


if __name__ == "__main__":
    main()
