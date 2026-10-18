#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli;

fn main() {
  const VERBOSE_FLAGS: [&str; 3] = ["--verbose", "--debug", "-v"];
  let tokens: Vec<String> = std::env::args().skip(1).collect();
  let verbose = tokens.iter().any(|t| VERBOSE_FLAGS.contains(&t.as_str()));
  let tokens: Vec<String> = tokens
    .into_iter()
    .filter(|t| !VERBOSE_FLAGS.contains(&t.as_str()))
    .collect();
  if cli::wants(&tokens) {
    std::process::exit(cli::run(&tokens));
  }
  lcars_shell_lib::run(verbose);
}
