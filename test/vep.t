#!/usr/bin/env perl -w

use strict;
use warnings;

use Test::More;

use File::Spec;
use LWP::UserAgent;
use HTTP::Request::Common;
use JSON;
use Cwd qw(abs_path);

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

my $input_file = abs_path(File::Spec->rel2abs("../example.vcf", __FILE__));
open(my $inputfh, "<", $input_file) or die("Can't open example.vcf: $!");
my $data = join("", <$inputfh>);
close($inputfh);

### Create the input file on the server, that we can then use as input to the mock command
$response = $ua->post($response_perl->{annotationFilesUrl},
	[input => [undef, 'input', 'Content_Type' => 'text/plain', Content => $data]],
	'Content_Type' => 'form-data'
);

### And now let's run the workflow.
$url = URI->new($response_perl->{annotationStatusUrl});
$url->query_form('running' => 'true', 'command' => 'annotate');
$response = $ua->put($url);
ok($response->is_success, "Successful PUT ".$url->path());
if (! $response->is_success) {
	diag($response->content);
}

### Wait for a status
$url = URI->new($response_perl->{annotationFilesUrl});
$url->path_segments($url->path_segments(), '.status');

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

### And at this stage, we can request the output annotated data file.
$url = URI->new($response_perl->{annotationFilesUrl});
$url->path_segments($url->path_segments(), 'output');
$response = $ua->get($url);
if (! $response->is_success) {
	diag($response->content);
}

like($response->content, qr/Consequence type as predicted by VEP/, "Checked for annotations");
like($response->content, qr/HGVSp/, "Checked for HGVS");
like($response->content, qr/PolyPhen/, "Checked for PolyPhen");

### When we are done, we can delete the command results
$url = URI->new($response_perl->{annotationDeleteUrl});
$response = $ua->delete($url);
ok($response->is_success, "Successful DELETE ".$url->path());
if (! $response->is_success) {
	diag($response->content);
}

done_testing();

1;