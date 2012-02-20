<?php
header('Content-Type: text/javascript');
sleep(rand(0,5));
$idx = (isset($_GET['num']) ? (int) $_GET['num'] : 0);
echo "jslog('script " . $idx . " executed');\n";

/*
Extra code to test the mode of operations where we act 100% safe using the google approach
as described in the lazyload.js comment ~ line 475 onwards.
*/
$cb = (isset($_GET['cb']) ? preg_replace('/[^A-Za-z0-9._]+/', '', (string) $_GET['cb']) : '');
if (empty($cb) && isset($_GET['cb']))
{
	$cb = 'window.ccms_lazyload_setup_GHO';
}

if (!empty($cb))
{
	echo <<<EOT
	
if (typeof $cb == 'function')
{
	jslog('invoking google-style callback "$cb($idx)"...');
	$cb($idx);
}

EOT;
}
