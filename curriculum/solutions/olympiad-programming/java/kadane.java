import java.io.BufferedInputStream;
import java.io.IOException;

public class Main {
    public static void main(String[] args) throws Exception {
        FastScanner in = new FastScanner();
        int n = in.nextInt();
        if (n == Integer.MIN_VALUE) return;
        long first = in.nextLong();
        long current = first, best = first;
        int start = 0, bestLeft = 0, bestRight = 0;
        for (int i = 1; i < n; i++) {
            long value = in.nextLong();
            if (value > current + value) { current = value; start = i; }
            else current += value;
            if (current > best) { best = current; bestLeft = start; bestRight = i; }
        }
        System.out.println(best + " " + (bestLeft + 1) + " " + (bestRight + 1));
    }

    private static final class FastScanner {
        private final BufferedInputStream input = new BufferedInputStream(System.in);
        private final byte[] buffer = new byte[1 << 16];
        private int position = 0, length = 0;
        private int read() throws IOException {
            if (position >= length) { length = input.read(buffer); position = 0; if (length < 0) return -1; }
            return buffer[position++];
        }
        long nextLong() throws IOException {
            int ch;
            do { ch = read(); } while (ch <= ' ' && ch >= 0);
            if (ch < 0) throw new IOException("Unexpected end of input");
            boolean negative = ch == '-';
            if (negative) ch = read();
            long value = 0;
            while (ch > ' ') { value = value * 10 + ch - '0'; ch = read(); }
            return negative ? -value : value;
        }
        int nextInt() throws IOException { return Math.toIntExact(nextLong()); }
    }
}
