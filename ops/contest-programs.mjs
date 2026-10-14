export const programs = {
  java: 'import java.util.*; public class Main { public static void main(String[] a) { Scanner s=new Scanner(System.in); System.out.println(s.nextLong()*FACTOR); }}',
  python: 'print(int(input())*FACTOR)',
  cpp: '#include <iostream>\nint main(){long long x;std::cin>>x;std::cout<<x*FACTOR<<"\\n";}',
  c: '#include <stdio.h>\nint main(){long long x;scanf("%lld",&x);printf("%lld\\n",x*FACTOR);}',
  csharp: 'using System; class Program { static void Main(){ Console.WriteLine(long.Parse(Console.ReadLine())*FACTOR); }}',
  kotlin: 'fun main(){println(readln().trim().toLong()*FACTOR)}',
  js: 'const fs=require("fs"); console.log(Number(fs.readFileSync(0,"utf8").trim())*FACTOR);',
  go: 'package main\nimport("fmt")\nfunc main(){var x int64;fmt.Scan(&x);fmt.Println(x*FACTOR)}',
  rust: 'use std::io::{self,Read}; fn main(){let mut s=String::new();io::stdin().read_to_string(&mut s).unwrap();let x:i64=s.trim().parse().unwrap();println!("{}",x*FACTOR);}',
  pascal: 'program main; var x:int64; begin readln(x);writeln(x*FACTOR);end.',
  d: 'import std.stdio; import std.conv; import std.string; void main(){long x=readln().strip.to!long;writeln(x*FACTOR);}',
  dart: 'import "dart:io"; void main(){print(int.parse(stdin.readLineSync()!.trim())*FACTOR);}',
  haskell: 'main = do\n x <- readLn :: IO Integer\n print (x*FACTOR)',
  lisp: '(format t "~a~%" (* (read) FACTOR))',
  lua: 'local x=io.read("*n"); print(x*FACTOR)',
  perl: 'my $x=<STDIN>; print $x*FACTOR,"\\n";',
  php: '$x=(int)trim(fgets(STDIN)); echo $x*FACTOR,"\\n";',
  ruby: 'puts STDIN.gets.to_i*FACTOR',
  swift: 'import Foundation\nlet x=Int64(readLine()!.trimmingCharacters(in:.whitespacesAndNewlines))!\nprint(x*FACTOR)',
};
export const languages = Object.keys(programs);
export function program(language, salt, wrong = false) {
  const text = programs[language].replaceAll('FACTOR', wrong ? '3' : '2');
  const comment = ['python','perl','ruby'].includes(language) ? `# ${salt}`
    : ['lua','haskell'].includes(language) ? `-- ${salt}`
    : language === 'lisp' ? `; ${salt}` : language === 'pascal' ? `{ ${salt} }` : `// ${salt}`;
  return `${language === 'php' ? '<?php\n' : ''}${comment}\n${text}\n`;
}
