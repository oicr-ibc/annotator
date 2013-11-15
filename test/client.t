#!/usr/bin/env perl -w

use strict;
use warnings;

use Test::More;

use LWP::UserAgent;
use HTTP::Request::Common;
use JSON;

my $base = "http://localhost:8006/";

# Create a user agent, and use a short timeout, as this is not going to be useful for long-running
# commands. 
my $ua = LWP::UserAgent->new();
$ua->timeout(5);
$ua->env_proxy;

my $json = JSON->new();

my $request;
my $response;
my $url;

### Check that we can ping the main URL
$response = $ua->get(URI->new_abs('/annotator', $base));

ok($response->is_success, "Successful GET /annotator");
if (! $response->is_success) {
	diag($response->content);
}

### Now, let's create and run a workflow
my $form = {};
$response = $ua->post(URI->new_abs('/annotator', $base), $form);
ok($response->is_success, "Successful POST /annotator");
if (! $response->is_success) {
	diag($response->content);
}

# We should be able to parse the result as JSON
my $response_perl = eval { $json->decode($response->content) };
ok(defined($response_perl), "Should parse response as JSON");

ok(exists($response_perl->{identifier}), "Should contain an identifier");
ok(exists($response_perl->{annotationFilesUrl}), "Should contain an annotationFilesUrl");
ok(exists($response_perl->{annotationStatusUrl}), "Should contain an annotationStatusUrl");
ok(exists($response_perl->{annotationDeleteUrl}), "Should contain an annotationStatusUrl");

### Create a simple file on the server, that we can then use as input to the mock command
$response = $ua->post($response_perl->{annotationFilesUrl},
	[input => [undef, 'input', 'Content_Type' => 'text/plain', Content => "Line 1\nLine 2\n" x 100]],
	'Content_Type' => 'form-data'
);

ok($response->is_success, "Successful POST ".URI->new($response_perl->{annotationFilesUrl})->path());
if (! $response->is_success) {
	diag($response->content);
}

### When done, we should be able to read back the file that we just created.
$url = URI->new($response_perl->{annotationFilesUrl});
$url->path_segments($url->path_segments(), 'input');
$response = $ua->get($url);

ok($response->is_success, "Successful GET ".$url->path());
if (! $response->is_success) {
	diag($response->content);
}

is($response->content, "Line 1\nLine 2\n" x 100, "Got correct content back");

### Now let's trigger the process
$url = URI->new($response_perl->{annotationStatusUrl});
$url->query_form('running' => 'true', 'command' => 'mock');
$response = $ua->put($url);
ok($response->is_success, "Successful PUT ".$url->path());
if (! $response->is_success) {
	diag($response->content);
}

# At this stage, there should be a number of files that are starting to be accessible,
# although we can't be totally specific about the pid being there instantly, for example. 
# The status is the clue. 

# Wait a moment, so we are likely to at least get a .pid file.
sleep(1);

$url = URI->new($response_perl->{annotationFilesUrl});
$url->path_segments($url->path_segments(), '.pid');
$response = $ua->get($url);
ok($response->is_success, "Successful GET ".$url->path());
if (! $response->is_success) {
	diag($response->content);
}

# We shouldn't have a status file yet, that should normally take a little longer. So let's
# expect a 404. 

$url = URI->new($response_perl->{annotationFilesUrl});
$url->path_segments($url->path_segments(), '.status');
$response = $ua->get($url);
is($response->code, 404, "GET ".$url->path()." should return a 404");

# We how wait, a maximum of 20 times, before we get a 200 and a zero back. 
foreach my $i (1..20) {
	sleep(1);
	$response = $ua->get($url);
	if ($response->code() == 200) {
		last;
	}
}

ok($response->is_success, "Successful GET ".$url->path());
if (! $response->is_success) {
	diag($response->content);
}

# At this stage, the status file should contain a zero.
is(0 + $response->content, 0, "Final status should be zero");

# And finally, let's read back the output file.
$url = URI->new($response_perl->{annotationFilesUrl});
$url->path_segments($url->path_segments(), 'output');
$response = $ua->get($url);
if (! $response->is_success) {
	diag($response->content);
}

is($response->content, "ECHO: Line 1\nECHO: Line 2\n" x 100, "Checked modified output file from echo command");

### When we are done, we can delete the command results
$url = URI->new($response_perl->{annotationDeleteUrl});
$response = $ua->delete($url);
ok($response->is_success, "Successful DELETE ".$url->path());
if (! $response->is_success) {
	diag($response->content);
}

### And now we should now get a 404 back, even for the .pid
$url = URI->new($response_perl->{annotationFilesUrl});
$url->path_segments($url->path_segments(), '.pid');
$response = $ua->get($url);
is($response->code, 404, "GET ".$url->path()." should return a 404");

done_testing();

1;