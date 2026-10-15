<?php
// Mounted as /etc/phpmyadmin/config.user.inc.php, together with ca.pem.
// Credentials are entered in the local phpMyAdmin login form, not stored here.
$cfg['Servers'][1]['ssl'] = true;
$cfg['Servers'][1]['ssl_verify'] = true;
$cfg['Servers'][1]['ssl_ca'] = '/etc/phpmyadmin/ca.pem';
