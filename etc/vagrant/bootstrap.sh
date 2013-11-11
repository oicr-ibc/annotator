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

# So now we can start setting up the Ensembl basics. We do need to be a little
# careful about where we put this stuff. 

cd /var/local
wget -q -O variant_effect_predictor.tar.gz \
"http://cvs.sanger.ac.uk/cgi-bin/viewvc.cgi/ensembl-tools/scripts/variant_effect_predictor.tar.gz?view=tar&root=ensembl&pathrev=branch-ensembl-73"
tar xvfz variant_effect_predictor.tar.gz
cd variant_effect_predictor
yes "n" | perl INSTALL.pl

# Now we can download the data. Use rsync as it is much faster than FTP, and when it is 
# available, also much less problematic in terms of funny port usage. 
cd /var/local/variant_effect_predictor
rsync -v rsync://ftp.ensembl.org/ensembl/pub/release-73/variation/VEP/homo_sapiens_vep_73.tar.gz .
tar xfz homo_sapiens_vep_73.tar.gz
rm homo_sapiens_vep_73.tar.gz

# We also need the FASTA files
cd /var/local/variant_effect_predictor
rsync -v rsync://ftp.ensembl.org/ensembl/pub/release-73/fasta/homo_sapiens/dna/Homo_sapiens.GRCh37.73.dna.primary_assembly.fa.gz .
gzip -d Homo_sapiens.GRCh37.73.dna.primary_assembly.fa.gz

# Now all we need to do is write and start the RESTful API and link it up to a port where we
# can provide a web service. Much of this will be an adapter for the various annotators, 
# only some of which we can handle. 

# Now let's get the stuff where we need it. Note that we need to make a copy
# because node_modules will contain binary shit. 
rm -rf /var/local/annotator
cp -rf /vagrant /var/local/annotator

# Remove node_modules, which likely contains garbage synced here
rm -rf /var/local/annotator/node_modules

# Remove config.json if we have one (synced from host) and put in the deployment one
rm -f /var/local/annotator/config.json
cp -f /vagrant/etc/vagrant/annotator-config.json /var/local/annotator/config.json

# And set up the server configuration
cp /vagrant/etc/vagrant/upstart-annotator.conf /etc/init/annotator.conf

# Replace the default site
rm /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/annotator /etc/nginx/sites-enabled/annotator

# Build
cd /var/local/annotator
npm install 
node_modules/coffee-script/bin/cake build

# Start daemons
initctl start annotator
