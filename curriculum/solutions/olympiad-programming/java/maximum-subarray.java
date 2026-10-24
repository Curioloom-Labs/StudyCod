import java.io.BufferedInputStream;
import java.io.IOException;

public class Main {
    public static void main(String[] args) throws Exception {
        FastScanner in = new FastScanner();
        int n = in.nextInt();
        if (n == Integer.MIN_VALUE) return;
        long[] values = new long[n];
        for (int i = 0; i < n; i++) values[i] = in.nextLong();
        long best = values[0];
        for (int left = 0; left < n; left++) {
            long current = 0;
            for (int right = left; right < n; right++) {
                current += values[right];
                if (current > best) best = current;
            }
        }
        System.out.println(best);
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
