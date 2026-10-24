import java.io.BufferedInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) throws Exception {
        FastScanner in = new FastScanner();
        int n = in.nextInt();
        if (n == Integer.MIN_VALUE) return;
        int q = in.nextInt();
        long[] prefix = new long[n + 1];
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + in.nextLong();
        StringBuilder output = new StringBuilder();
        for (int i = 0; i < q; i++) {
            int left = in.nextInt();
            int right = in.nextInt();
            if (i > 0) output.append('\n');
            output.append(prefix[right] - prefix[left - 1]);
        }
        System.out.print(output);
    }

    private static final class FastScanner {
        private final BufferedInputStream input = new BufferedInputStream(System.in);
        private final byte[] buffer = new byte[1 << 16];
        private int position = 0, length = 0;
        private int read() throws IOException {
            if (position >= length) {
                length = input.read(buffer);
                position = 0;
                if (length < 0) return -1;
            }
            return buffer[position++];
        }
        long nextLong() throws IOException {
            int ch;
            do { ch = read(); } while (ch <= ' ' && ch >= 0);
            if (ch < 0) throw new IOException("Unexpected end of input");
            boolean negative = ch == '-';
            if (negative) ch = read();
            long value = 0;
            while (ch > ' ') {
                value = value * 10 + ch - '0';
                ch = read();
            }
            return negative ? -value : value;
        }
        int nextInt() throws IOException {
            try { return Math.toIntExact(nextLong()); }
            catch (ArithmeticException error) { throw new IOException("Integer input is out of range", error); }
        }
    }
}
