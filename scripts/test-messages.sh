#!/bin/bash

PORT=${1:-6514}

echo "Sending test messages to port $PORT..."

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

echo "<134>1 $TIMESTAMP server1.local app - - Info: Application started successfully" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server1.local app - - Error: Database connection failed" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server2.local app - - Error: Out of memory exception" | nc localhost $PORT
sleep 0.1
echo "<130>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server3.local app - - Critical: System failure detected" | nc localhost $PORT
sleep 0.1
echo "<134>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server1.local nginx - - status=200 GET /api/health" | nc localhost $PORT
sleep 0.1
echo "<134>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server2.local nginx - - status=500 Internal server error" | nc localhost $PORT
sleep 0.1
echo "<134>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server3.local nginx - - status=500 Database unavailable" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") auth.local sshd - - Authentication failure for user admin" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") auth.local sshd - - Failed login attempt from 192.168.1.100" | nc localhost $PORT
sleep 0.1
echo "<134>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server1.local app - - status=401 Unauthorized access attempt" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server2.local app - - Error: Connection refused to database" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server3.local app - - Error: Timeout connecting to Redis" | nc localhost $PORT
sleep 0.1
echo "<134>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server1.local nginx - - status=500 PHP Fatal error" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server2.local app - - Exception: NullPointerException at line 42" | nc localhost $PORT
sleep 0.1
echo "<131>1 $(date -u +"%Y-%m-%dT%H:%M:%S.000Z") server3.local app - - Error: Failed to process payment" | nc localhost $PORT

echo "Sent 15 test messages!"