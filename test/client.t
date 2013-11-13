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

done_testing();

1;