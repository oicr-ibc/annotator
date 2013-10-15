#!/usr/bin/env bash

apt-get update
apt-get install -y python-software-properties python build-essential openssl libssl-dev

# Grab the latest node and build from scratch. This doesn't depend on external versioning
# from weird PPA repositories.

cd
wget -q http://nodejs.org/dist/node-latest.tar.gz
mkdir node-latest
cd node-latest
tar xvz --strip-components=1 < ../node-latest.tar.gz
./configure
make && make install
cd 
rm -rf node-latest

# Okay, we won't do an nginx install, as that isn't really helpful. But we do need a 
# decent Perl. 

wget -q http://www.cpan.org/src/5.0/perl-5.18.1.tar.gz
mkdir perl-latest
cd perl-latest
tar xvz --strip-components=1 < ../perl-5.18.1.tar.gz
sh Configure -de
make && make install
cd
rm -rf perl-latest

# Give me cpanm and a few important modules
wget -q -O - http://cpanmin.us | perl - --sudo App::cpanminus
cpanm File::Listing
cpanm LWP::Simple
cpanm DBI

# So now we can start setting up the Ensembl basics. 

cd
wget -q -O variant_effect_predictor.tar.gz \
"http://cvs.sanger.ac.uk/cgi-bin/viewvc.cgi/ensembl-tools/scripts/variant_effect_predictor.tar.gz?view=tar&root=ensembl&pathrev=branch-ensembl-73"
tar xvfz variant_effect_predictor.tar.gz
cd variant_effect_predictor
yes "n" | perl INSTALL.pl

# Now we can download the data. Use rsync as it is much faster than FTP, and when it is 
# available, also much less problematic in terms of funny port usage. 
cd /tmp
rsync -v rsync://ftp.ensembl.org/ensembl/pub/release-73/variation/VEP/homo_sapiens_vep_73.tar.gz .
cd
cd .vep
tar xfz /tmp/homo_sapiens_vep_73.tar.gz
rm /tmp/homo_sapiens_vep_73.tar.gz

# We also need the FASTA files
cd
rsync -v rsync://ftp.ensembl.org/ensembl/pub/release-73/fasta/homo_sapiens/dna/Homo_sapiens.GRCh37.73.dna.primary_assembly.fa.gz .
gzip -d /tmp/Homo_sapiens.GRCh37.73.dna.primary_assembly.fa.gz
