<?php
// Frontend-only secure bridge to the existing backend QR endpoint.
// The backend API key remains on the server; it is never sent to browser JavaScript.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
function fail_qr($msg, $status=400) { http_response_code($status); echo json_encode(['success'=>false,'message'=>$msg]); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail_qr('Method not allowed.',405);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origin && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\\d+$/', '', $host)) fail_qr('Origin not allowed.',403);
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) fail_qr('Invalid request body.');
$id = filter_var($input['booking_id'] ?? null, FILTER_VALIDATE_INT);
if (!$id || $id < 1) fail_qr('Invalid booking ID.');
$token = $input['token'] ?? '';
if (!is_string($token) || !preg_match('/^[A-Za-z0-9._-]+$/', $token)) fail_qr('Please sign in again.',401);
$configFile=__DIR__.'/../event-ticketing-backend/config/config.php';
if (!is_file($configFile)) fail_qr('Backend configuration not found. Check the folder names.',500);
$config=require $configFile;
$key=$config['app']['api_key'] ?? '';
if (!$key || str_starts_with($key,'CHANGE_')) fail_qr('Backend API key not configured.',500);
// Fixed localhost target avoids accepting untrusted destinations from the browser.
$url='http://127.0.0.1/Web-API-Project/event-ticketing-backend/api/bookings/'.$id.'/qr';
$ctx=stream_context_create(['http'=>['method'=>'GET','timeout'=>12,'ignore_errors'=>true,'header'=>"Authorization: Bearer ".$token."\r\nX-API-Key: ".$key."\r\nAccept: application/json\r\n"]]);
$result=@file_get_contents($url,false,$ctx);
if ($result===false) fail_qr('Cannot reach the backend QR endpoint. Check Apache and PHP allow_url_fopen.',502);
$status=200;
foreach(($http_response_header??[]) as $h) if(preg_match('/^HTTP\/\S+\s+(\d+)/',$h,$match)) $status=(int)$match[1];
if (!json_decode($result,true)) fail_qr('Backend returned invalid JSON.',502);
http_response_code($status);
echo $result;
