<?php
set_time_limit(300);

header('Content-Type: application/json');

$args = [
  'simulation_length' => 24,
  'init_pop' => 1,
  'simulation_count' => 10,

  'maturation_interval' => 6,
  'gestation_interval' => 3,
  'pregnancy_interval' => 0,
  'fertile_interval' => 18,
  'impregnation_rate' => 0.95,

  'cats_die' => 'FALSE',
  'cat_lifespan' => 24*30,

  'min_litter_size' => 1,
  'max_litter_size' => 6,

  'sex_dist' => "normal",
  'litter_dist' => "normal",
];

foreach($args as $key=>$value) {
  if(!isset($_GET[$key])) {
    continue;
  }

  switch($key) {
    case 'impregnation_rate':
      $args[$key] = floatval($_GET[$key]);
      break;

    case 'cats_die':
      $args[$key] = !empty($_GET[$key]) ? 'TRUE' : 'FALSE';
      break;

    case 'sex_dist':
    case 'litter_dist':
      $args[$key] = preg_replace("/[^A-Z0-9\_]/i", "", $_GET[$key]);
      break;

    default:
      $args[$key] = intval($_GET[$key]);
  }
}

$exec_string = 'export DYLD_LIBRARY_PATH=" "; R --vanilla --args ';
$shell_args = array_map(function($n) {
  return escapeshellarg($n);
}, $args);
$exec_string .= implode(" ", $shell_args) . " < model.R 2>&1";

$output = array();
exec($exec_string, $output);

$output = implode("\n", $output);

$pos = strpos($output, '{\"trial.1');
$json = stripslashes(substr($output, $pos, -3));
echo $json;