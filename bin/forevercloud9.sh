#!/bin/sh

HERE=`pwd`
NODE="node"
FOREVER_NODE="node"
FOREVER_BIN="node_modules/forever/bin/forever"
CMD="$0"
CMD_DIR=`dirname "$CMD"`
cd "$CMD_DIR/.."

make update

case `uname -a` in
Linux*x86_64*)  echo "Linux 64 bit"
   $FOREVER_NODE $FOREVER_BIN -v -c "$NODE" server.js "$@" -a x-www-browser -w "$HERE"
    ;;

Linux*i686*)  echo "Linux 32 bit"
    $FOREVER_NODE $FOREVER_BIN -v -c "$NODE" server.js "$@" -a x-www-browser -w "$HERE"
    ;;

Darwin*)  echo  "OSX"
    "$NODE" server.js "$@" -a open -w "$HERE"
    ;;

FreeBSD*64*) echo "FreeBSD 64 bit"
    "$NODE" server.js "$@" -a open -w "$HERE"
    ;;

CYGWIN*)  echo  "Cygwin"
    "$NODE" server.js "$@" -a "cmd /c start" -w "$HERE"
    ;;

MING*)  echo  "MingW"
    "$NODE" server.js "$@" -a "cmd /c start" -w "$HERE"
    ;;

SunOS*)  echo  "Solaris"
    "$NODE" server.js "$@" -w "$HERE"
    ;;


*) echo "Unknown OS"
   ;;
esac


