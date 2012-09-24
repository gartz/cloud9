#!/bin/sh

NODE="node"
CMD="$0"
CMD_DIR=`dirname "$CMD"`
FOREVER_NODE="node"
FOREVER_BIN="node_modules/forever/bin/forever"
cd "$CMD_DIR/.."

make update

case `uname -a` in
Linux*x86_64*)  echo "Linux 64 bit"
   $FOREVER_NODE $FOREVER_BIN -v -c "$NODE" server.js "$@" -a x-www-browser
    ;;

Linux*i686*)  echo "Linux 32 bit"
    $FOREVER_NODE $FOREVER_BIN -v -c "$NODE" server.js "$@" -a x-www-browser
    ;;

Darwin*)  echo  "OSX"
    "$NODE" server.js "$@" -a open
    ;;

FreeBSD*64*) echo "FreeBSD 64 bit"
    "$NODE" server.js "$@" -a open
    ;;

CYGWIN*)  echo  "Cygwin"
    "$NODE" server.js "$@" -a "cmd /c start"
    ;;

MING*)  echo  "MingW"
    "$NODE" server.js "$@" -a "cmd /c start"
    ;;

SunOS*)  echo  "Solaris"
    "$NODE" server.js "$@"
    ;;


*) echo "Unknown OS"
   ;;
esac


