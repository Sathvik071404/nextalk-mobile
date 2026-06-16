package expo.modules.nextalknearby

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Base64
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

class NexTalkNearbyModule : Module() {
  private val serviceId = "com.nextalk.mobile"
  private val strategy = Strategy.P2P_CLUSTER
  private val lanServiceType = "_nextalk._tcp."
  private val notificationChannelId = "nextalk-nearby-messages"
  private val secureKeyPrefix = "__NEXTALK_KEY__:"
  private val securePayloadPrefix = "__NEXTALK_SECURE__:"
  private val ioExecutor = Executors.newCachedThreadPool()
  private val secureRandom = SecureRandom()

  private val discoveredEndpoints = ConcurrentHashMap<String, String>()
  private val lanEndpoints = ConcurrentHashMap<String, NsdServiceInfo>()
  private val lanServiceEndpoints = ConcurrentHashMap<String, String>()
  private val lanPeers = ConcurrentHashMap<String, LanPeer>()
  private val secureSessions = ConcurrentHashMap<String, SecureSession>()

  @Volatile private var silentMode = false
  @Volatile private var lanDisplayName = "NexTalk User"
  @Volatile private var lanServerSocket: ServerSocket? = null
  @Volatile private var lanRegistrationListener: NsdManager.RegistrationListener? = null
  @Volatile private var lanDiscoveryListener: NsdManager.DiscoveryListener? = null
  @Volatile private var registeredLanServiceName: String? = null

  private class SecureSession(val keyPair: KeyPair) {
    @Volatile var key: SecretKeySpec? = null
    @Volatile var fingerprint: String? = null
  }

  private class LanPeer(
    val endpointId: String,
    val remoteName: String,
    val authenticationDigits: String,
    val socket: Socket,
    val input: DataInputStream,
    val output: DataOutputStream
  ) {
    val outputLock = Any()
    @Volatile var localAccepted = false
    @Volatile var remoteAccepted = false
    @Volatile var connected = false
    @Volatile var closed = false
  }

  private val connectionsClient: ConnectionsClient?
    get() = appContext.reactContext?.let { Nearby.getConnectionsClient(it) }

  private val nsdManager: NsdManager?
    get() = appContext.reactContext?.getSystemService(Context.NSD_SERVICE) as? NsdManager

  private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      discoveredEndpoints[endpointId] = info.endpointName
      sendEndpointFound(endpointId, info.endpointName, info.serviceId, "nearby")
    }

    override fun onEndpointLost(endpointId: String) {
      discoveredEndpoints.remove(endpointId)
      sendEvent("onEndpointLost", mapOf("endpointId" to endpointId, "transport" to "nearby"))
    }
  }

  private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, connectionInfo: ConnectionInfo) {
      sendConnectionInitiated(
        endpointId,
        connectionInfo.endpointName,
        connectionInfo.authenticationDigits,
        connectionInfo.isIncomingConnection,
        "nearby"
      )
    }

    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      val status = result.status
      sendConnectionResult(
        endpointId,
        status.isSuccess,
        status.statusCode,
        status.statusMessage ?: "",
        "nearby"
      )

      if (status.isSuccess) {
        beginSecureSession(endpointId)
      } else {
        destroySecureSession(endpointId)
      }
    }

    override fun onDisconnected(endpointId: String) {
      destroySecureSession(endpointId)
      sendEvent("onDisconnected", mapOf("endpointId" to endpointId, "transport" to "nearby"))
    }
  }

  private val payloadCallback = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      if (payload.type != Payload.Type.BYTES) {
        sendError("payloadReceived", "NexTalk currently accepts only byte message payloads.")
        return
      }

      val bytes = payload.asBytes() ?: return
      handleRawPayload(endpointId, payload.id, String(bytes, Charsets.UTF_8), "nearby")
    }

    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
      sendEvent(
        "onPayloadTransferUpdate",
        mapOf(
          "endpointId" to endpointId,
          "payloadId" to update.payloadId,
          "status" to update.status,
          "bytesTransferred" to update.bytesTransferred,
          "totalBytes" to update.totalBytes,
          "transport" to "nearby"
        )
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NexTalkNearby")

    Events(
      "onEndpointFound",
      "onEndpointLost",
      "onConnectionInitiated",
      "onConnectionResult",
      "onDisconnected",
      "onPayloadReceived",
      "onPayloadTransferUpdate",
      "onSecureSessionChanged",
      "onStateChanged",
      "onError"
    )

    OnDestroy {
      stopAll()
      ioExecutor.shutdownNow()
    }

    Function("isAvailable") {
      appContext.reactContext != null
    }

    Function("checkPermissions") {
      val context = appContext.reactContext

      mapOf(
        "bluetoothAdvertise" to context.hasPermission("android.permission.BLUETOOTH_ADVERTISE"),
        "bluetoothConnect" to context.hasPermission("android.permission.BLUETOOTH_CONNECT"),
        "bluetoothScan" to context.hasPermission("android.permission.BLUETOOTH_SCAN"),
        "nearbyWifiDevices" to context.hasPermission("android.permission.NEARBY_WIFI_DEVICES"),
        "accessCoarseLocation" to context.hasPermission("android.permission.ACCESS_COARSE_LOCATION"),
        "accessFineLocation" to context.hasPermission("android.permission.ACCESS_FINE_LOCATION"),
        "accessWifiState" to context.hasPermission("android.permission.ACCESS_WIFI_STATE"),
        "changeWifiState" to context.hasPermission("android.permission.CHANGE_WIFI_STATE"),
        "postNotifications" to context.hasPermission("android.permission.POST_NOTIFICATIONS")
      )
    }

    Function("getStatus") {
      val context = appContext.reactContext
      val playServicesStatus = context?.let {
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(it)
      } ?: ConnectionResult.INTERNAL_ERROR

      mapOf(
        "androidApiLevel" to Build.VERSION.SDK_INT,
        "strategy" to "P2P_CLUSTER",
        "serviceId" to serviceId,
        "playServicesAvailable" to (playServicesStatus == ConnectionResult.SUCCESS),
        "playServicesStatusCode" to playServicesStatus,
        "bluetoothEnabled" to context.safeBluetoothEnabled(),
        "wifiEnabled" to context.safeWifiEnabled(),
        "locationEnabled" to context.safeLocationEnabled(),
        "discoveredEndpointCount" to discoveredEndpoints.size,
        "lanAdvertising" to (lanServerSocket != null),
        "lanDiscovering" to (lanDiscoveryListener != null),
        "lanEndpointCount" to lanEndpoints.size,
        "lanPeerCount" to lanPeers.size,
        "secureSessionCount" to secureSessions.values.count { it.key != null },
        "silentMode" to silentMode
      )
    }

    Function("getSecureSessionStatus") { endpointId: String ->
      val session = secureSessions[endpointId]
      mapOf(
        "active" to (session?.key != null),
        "fingerprint" to (session?.fingerprint ?: "")
      )
    }

    Function("setSilentMode") { enabled: Boolean ->
      silentMode = enabled
    }

    AsyncFunction("startAdvertising") { displayName: String, promise: Promise ->
      val client = getClientOrReject(promise, "startAdvertising") ?: return@AsyncFunction
      val options = AdvertisingOptions.Builder().setStrategy(strategy).build()

      client
        .startAdvertising(displayName.safeDisplayName(), serviceId, connectionLifecycleCallback, options)
        .addOnSuccessListener {
          sendState("advertising", true)
          promise.resolve()
        }
        .addOnFailureListener { exception ->
          rejectWithEvent(promise, "startAdvertising", exception)
        }
    }

    AsyncFunction("stopAdvertising") {
      connectionsClient?.stopAdvertising()
      sendState("advertising", false)
    }

    AsyncFunction("startDiscovery") { promise: Promise ->
      val client = getClientOrReject(promise, "startDiscovery") ?: return@AsyncFunction
      val options = DiscoveryOptions.Builder().setStrategy(strategy).build()

      client
        .startDiscovery(serviceId, endpointDiscoveryCallback, options)
        .addOnSuccessListener {
          sendState("discovering", true)
          promise.resolve()
        }
        .addOnFailureListener { exception ->
          rejectWithEvent(promise, "startDiscovery", exception)
        }
    }

    AsyncFunction("stopDiscovery") {
      connectionsClient?.stopDiscovery()
      sendState("discovering", false)
    }

    AsyncFunction("startLanAdvertising") { displayName: String, promise: Promise ->
      beginLanAdvertising(displayName, promise)
    }

    AsyncFunction("stopLanAdvertising") {
      stopLanAdvertising()
    }

    AsyncFunction("startLanDiscovery") { promise: Promise ->
      beginLanDiscovery(promise)
    }

    AsyncFunction("stopLanDiscovery") {
      stopLanDiscovery()
    }

    AsyncFunction("requestConnection") { endpointId: String, displayName: String, promise: Promise ->
      if (endpointId.isLanEndpoint()) {
        requestLanConnection(endpointId, displayName, promise)
        return@AsyncFunction
      }

      val client = getClientOrReject(promise, "requestConnection") ?: return@AsyncFunction

      client
        .requestConnection(displayName.safeDisplayName(), endpointId, connectionLifecycleCallback)
        .addOnSuccessListener { promise.resolve() }
        .addOnFailureListener { exception ->
          rejectWithEvent(promise, "requestConnection", exception)
        }
    }

    AsyncFunction("acceptConnection") { endpointId: String, promise: Promise ->
      if (endpointId.isLanEndpoint()) {
        acceptLanConnection(endpointId, promise)
        return@AsyncFunction
      }

      val client = getClientOrReject(promise, "acceptConnection") ?: return@AsyncFunction

      client
        .acceptConnection(endpointId, payloadCallback)
        .addOnSuccessListener { promise.resolve() }
        .addOnFailureListener { exception ->
          rejectWithEvent(promise, "acceptConnection", exception)
        }
    }

    AsyncFunction("rejectConnection") { endpointId: String, promise: Promise ->
      if (endpointId.isLanEndpoint()) {
        rejectLanConnection(endpointId, promise)
        return@AsyncFunction
      }

      val client = getClientOrReject(promise, "rejectConnection") ?: return@AsyncFunction

      client
        .rejectConnection(endpointId)
        .addOnSuccessListener { promise.resolve() }
        .addOnFailureListener { exception ->
          rejectWithEvent(promise, "rejectConnection", exception)
        }
    }

    AsyncFunction("sendMessage") { endpointId: String, message: String, promise: Promise ->
      sendRawWithPromise(endpointId, message, "sendMessage", promise)
    }

    AsyncFunction("sendSecureMessage") { endpointId: String, message: String, promise: Promise ->
      val session = secureSessions[endpointId]
      val key = session?.key

      if (key == null) {
        val error = "The encrypted session is not ready yet."
        sendError("sendSecureMessage", error)
        promise.reject("ERR_NEXTALK_SECURE_SESSION_NOT_READY", error, null)
        return@AsyncFunction
      }

      try {
        val encryptedMessage = encryptMessage(message, key)
        sendRawWithPromise(endpointId, encryptedMessage, "sendSecureMessage", promise)
      } catch (exception: Exception) {
        rejectWithEvent(promise, "sendSecureMessage", exception)
      }
    }

    AsyncFunction("disconnect") { endpointId: String ->
      if (endpointId.isLanEndpoint()) {
        disconnectLanPeer(endpointId)
      } else {
        destroySecureSession(endpointId)
        connectionsClient?.disconnectFromEndpoint(endpointId)
      }
    }

    AsyncFunction("stopAllEndpoints") {
      stopAll()
    }
  }

  private fun beginLanAdvertising(displayName: String, promise: Promise) {
    val manager = nsdManager
    if (manager == null) {
      val message = "Same-Wi-Fi advertising is unavailable because Android NSD is missing."
      sendError("startLanAdvertising", message)
      promise.reject("ERR_NEXTALK_LAN_UNAVAILABLE", message, null)
      return
    }

    if (lanServerSocket != null) {
      promise.resolve()
      return
    }

    try {
      lanDisplayName = displayName.safeDisplayName()
      val serverSocket = ServerSocket(0)
      lanServerSocket = serverSocket
      startLanAcceptLoop(serverSocket)

      val serviceInfo = NsdServiceInfo().apply {
        serviceName = "NexTalk-${UUID.randomUUID().toString().take(8)}"
        serviceType = lanServiceType
        port = serverSocket.localPort
        try {
          setAttribute("displayName", lanDisplayName)
        } catch (_: Exception) {
          // Older/vendor NSD implementations may reject TXT attributes.
        }
      }

      val listener = object : NsdManager.RegistrationListener {
        override fun onServiceRegistered(registeredInfo: NsdServiceInfo) {
          registeredLanServiceName = registeredInfo.serviceName
          sendState("lanAdvertising", true)
          promise.resolve()
        }

        override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
          stopLanAdvertising()
          val message = "Same-Wi-Fi advertising failed ($errorCode)."
          sendError("startLanAdvertising", message)
          promise.reject("ERR_NEXTALK_LAN_ADVERTISING", message, null)
        }

        override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) = Unit

        override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
          sendError("stopLanAdvertising", "Same-Wi-Fi advertising could not unregister ($errorCode).")
        }
      }

      lanRegistrationListener = listener
      manager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (exception: Exception) {
      stopLanAdvertising()
      rejectWithEvent(promise, "startLanAdvertising", exception)
    }
  }

  private fun beginLanDiscovery(promise: Promise) {
    val manager = nsdManager
    if (manager == null) {
      val message = "Same-Wi-Fi discovery is unavailable because Android NSD is missing."
      sendError("startLanDiscovery", message)
      promise.reject("ERR_NEXTALK_LAN_UNAVAILABLE", message, null)
      return
    }

    if (lanDiscoveryListener != null) {
      promise.resolve()
      return
    }

    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(serviceType: String) {
        sendState("lanDiscovering", true)
        promise.resolve()
      }

      override fun onServiceFound(serviceInfo: NsdServiceInfo) {
        if (serviceInfo.serviceType != lanServiceType || serviceInfo.serviceName == registeredLanServiceName) return

        manager.resolveService(
          serviceInfo,
          object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
              sendError("resolveLanService", "Same-Wi-Fi device resolution failed ($errorCode).")
            }

            override fun onServiceResolved(resolvedInfo: NsdServiceInfo) {
              val host = resolvedInfo.host?.hostAddress ?: return
              val endpointId = "lan:$host:${resolvedInfo.port}"
              val endpointName = try {
                resolvedInfo.attributes["displayName"]?.toString(Charsets.UTF_8)?.safeDisplayName()
                  ?: resolvedInfo.serviceName.safeDisplayName()
              } catch (_: Exception) {
                resolvedInfo.serviceName.safeDisplayName()
              }

              lanEndpoints[endpointId] = resolvedInfo
              lanServiceEndpoints[resolvedInfo.serviceName] = endpointId
              sendEndpointFound(endpointId, endpointName, lanServiceType, "lan")
            }
          }
        )
      }

      override fun onServiceLost(serviceInfo: NsdServiceInfo) {
        val endpointId = lanServiceEndpoints.remove(serviceInfo.serviceName) ?: return
        lanEndpoints.remove(endpointId)
        sendEvent("onEndpointLost", mapOf("endpointId" to endpointId, "transport" to "lan"))
      }

      override fun onDiscoveryStopped(serviceType: String) {
        sendState("lanDiscovering", false)
      }

      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        lanDiscoveryListener = null
        val message = "Same-Wi-Fi discovery failed to start ($errorCode)."
        sendError("startLanDiscovery", message)
        promise.reject("ERR_NEXTALK_LAN_DISCOVERY", message, null)
      }

      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
        sendError("stopLanDiscovery", "Same-Wi-Fi discovery could not stop ($errorCode).")
      }
    }

    lanDiscoveryListener = listener

    try {
      manager.discoverServices(lanServiceType, NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (exception: Exception) {
      lanDiscoveryListener = null
      rejectWithEvent(promise, "startLanDiscovery", exception)
    }
  }

  private fun startLanAcceptLoop(serverSocket: ServerSocket) {
    ioExecutor.execute {
      while (!serverSocket.isClosed) {
        try {
          val socket = serverSocket.accept()
          ioExecutor.execute { prepareIncomingLanPeer(socket) }
        } catch (_: Exception) {
          if (!serverSocket.isClosed) {
            sendError("lanAccept", "Same-Wi-Fi host stopped accepting connections.")
          }
          break
        }
      }
    }
  }

  private fun prepareIncomingLanPeer(socket: Socket) {
    var endpointIdForCleanup: String? = null
    try {
      socket.tcpNoDelay = true
      val input = DataInputStream(socket.getInputStream())
      val output = DataOutputStream(socket.getOutputStream())
      val hello = JSONObject(input.readUTF())

      if (hello.optString("type") != "hello") {
        socket.close()
        return
      }

      val endpointId = hello.optString("endpointId").takeIf { it.isLanEndpoint() }
        ?: "lan:${socket.inetAddress.hostAddress}:${socket.port}"
      endpointIdForCleanup = endpointId
      val remoteName = hello.optString("displayName").safeDisplayName()
      val remotePublicKey = hello.optString("publicKey")
      val secureSession = getOrCreateSecureSession(endpointId)
      val digits = establishSecureSession(endpointId, remotePublicKey)
      val peer = LanPeer(endpointId, remoteName, digits, socket, input, output)
      lanPeers[endpointId] = peer

      writeLanFrame(
        peer,
        JSONObject()
          .put("type", "pair")
          .put("displayName", lanDisplayName)
          .put("authenticationDigits", digits)
          .put("publicKey", encodePublicKey(secureSession))
          .toString()
      )
      sendConnectionInitiated(endpointId, remoteName, digits, true, "lan")
      startLanPeerReader(peer)
    } catch (exception: Exception) {
      endpointIdForCleanup?.let { destroySecureSession(it) }
      try {
        socket.close()
      } catch (_: Exception) {
        // Socket is already closed.
      }
      sendError("lanAccept", exception.localizedMessage ?: "Same-Wi-Fi connection handshake failed.")
    }
  }

  private fun requestLanConnection(endpointId: String, displayName: String, promise: Promise) {
    val serviceInfo = lanEndpoints[endpointId]
    val host = serviceInfo?.host
    val port = serviceInfo?.port ?: 0

    if (serviceInfo == null || host == null || port <= 0) {
      val message = "The same-Wi-Fi device is no longer available."
      sendError("requestConnection", message)
      promise.reject("ERR_NEXTALK_LAN_ENDPOINT_LOST", message, null)
      return
    }

    ioExecutor.execute {
      try {
        val socket = Socket()
        socket.connect(InetSocketAddress(host, port), 8000)
        socket.tcpNoDelay = true
        val input = DataInputStream(socket.getInputStream())
        val output = DataOutputStream(socket.getOutputStream())
        val secureSession = getOrCreateSecureSession(endpointId)

        synchronized(output) {
          output.writeUTF(
            JSONObject()
              .put("type", "hello")
              .put("endpointId", endpointId)
              .put("displayName", displayName.safeDisplayName())
              .put("publicKey", encodePublicKey(secureSession))
              .toString()
          )
          output.flush()
        }

        val pair = JSONObject(input.readUTF())
        if (pair.optString("type") != "pair") {
          throw IllegalStateException("The same-Wi-Fi host returned an invalid handshake.")
        }

        val remoteName = pair.optString("displayName").safeDisplayName()
        val digits = pair.optString("authenticationDigits")
        val derivedDigits = establishSecureSession(endpointId, pair.optString("publicKey"))
        if (digits != derivedDigits) {
          throw SecurityException("The same-Wi-Fi pairing code could not be authenticated.")
        }
        val peer = LanPeer(endpointId, remoteName, digits, socket, input, output)
        lanPeers[endpointId] = peer
        sendConnectionInitiated(endpointId, remoteName, digits, false, "lan")
        startLanPeerReader(peer)
        promise.resolve()
      } catch (exception: Exception) {
        destroySecureSession(endpointId)
        rejectWithEvent(promise, "requestConnection", exception)
      }
    }
  }

  private fun startLanPeerReader(peer: LanPeer) {
    ioExecutor.execute {
      try {
        while (!peer.closed) {
          val frame = JSONObject(peer.input.readUTF())

          when (frame.optString("type")) {
            "accept" -> {
              peer.remoteAccepted = true
              completeLanConnectionIfReady(peer)
            }
            "reject" -> {
              sendConnectionResult(peer.endpointId, false, -1, "Pairing was rejected.", "lan")
              closeLanPeer(peer, false)
            }
            "data" -> {
              val encoded = frame.optString("payload")
              val text = String(Base64.decode(encoded, Base64.NO_WRAP), Charsets.UTF_8)
              handleRawPayload(peer.endpointId, System.currentTimeMillis(), text, "lan")
            }
            "disconnect" -> {
              closeLanPeer(peer, true)
            }
          }
        }
      } catch (_: Exception) {
        closeLanPeer(peer, peer.connected)
      }
    }
  }

  private fun acceptLanConnection(endpointId: String, promise: Promise) {
    val peer = lanPeers[endpointId]
    if (peer == null) {
      val message = "The same-Wi-Fi connection request expired."
      sendError("acceptConnection", message)
      promise.reject("ERR_NEXTALK_LAN_CONNECTION_LOST", message, null)
      return
    }

    try {
      peer.localAccepted = true
      writeLanControl(peer, "accept")
      completeLanConnectionIfReady(peer)
      promise.resolve()
    } catch (exception: Exception) {
      rejectWithEvent(promise, "acceptConnection", exception)
    }
  }

  private fun rejectLanConnection(endpointId: String, promise: Promise) {
    val peer = lanPeers[endpointId]
    if (peer == null) {
      promise.resolve()
      return
    }

    try {
      writeLanControl(peer, "reject")
      closeLanPeer(peer, false)
      promise.resolve()
    } catch (exception: Exception) {
      rejectWithEvent(promise, "rejectConnection", exception)
    }
  }

  private fun completeLanConnectionIfReady(peer: LanPeer) {
    synchronized(peer) {
      if (!peer.localAccepted || !peer.remoteAccepted || peer.connected || peer.closed) return
      peer.connected = true
    }
    sendConnectionResult(peer.endpointId, true, 0, "", "lan")
    if (secureSessions[peer.endpointId]?.key == null) {
      beginSecureSession(peer.endpointId)
    }
  }

  private fun writeLanControl(peer: LanPeer, type: String) {
    writeLanFrame(peer, JSONObject().put("type", type).toString())
  }

  private fun writeLanData(peer: LanPeer, message: String) {
    writeLanFrame(
      peer,
      JSONObject()
        .put("type", "data")
        .put("payload", Base64.encodeToString(message.toByteArray(Charsets.UTF_8), Base64.NO_WRAP))
        .toString()
    )
  }

  private fun writeLanFrame(peer: LanPeer, frame: String) {
    synchronized(peer.outputLock) {
      peer.output.writeUTF(frame)
      peer.output.flush()
    }
  }

  private fun disconnectLanPeer(endpointId: String) {
    val peer = lanPeers[endpointId] ?: return
    try {
      writeLanControl(peer, "disconnect")
    } catch (_: Exception) {
      // Closing the socket still ends the session.
    }
    closeLanPeer(peer, false)
  }

  private fun closeLanPeer(peer: LanPeer, notifyRemoteDisconnect: Boolean) {
    if (peer.closed) return

    peer.closed = true
    lanPeers.remove(peer.endpointId, peer)
    destroySecureSession(peer.endpointId)

    try {
      peer.socket.close()
    } catch (_: Exception) {
      // Socket is already closed.
    }

    if (notifyRemoteDisconnect) {
      sendEvent("onDisconnected", mapOf("endpointId" to peer.endpointId, "transport" to "lan"))
    }
  }

  private fun stopLanAdvertising() {
    val manager = nsdManager
    val listener = lanRegistrationListener
    lanRegistrationListener = null
    registeredLanServiceName = null

    if (manager != null && listener != null) {
      try {
        manager.unregisterService(listener)
      } catch (_: Exception) {
        // Registration may already be gone.
      }
    }

    try {
      lanServerSocket?.close()
    } catch (_: Exception) {
      // Server socket is already closed.
    }
    lanServerSocket = null
    sendState("lanAdvertising", false)
  }

  private fun stopLanDiscovery() {
    val manager = nsdManager
    val listener = lanDiscoveryListener
    lanDiscoveryListener = null

    if (manager != null && listener != null) {
      try {
        manager.stopServiceDiscovery(listener)
      } catch (_: Exception) {
        // Discovery may already be stopped.
      }
    }

    lanEndpoints.clear()
    lanServiceEndpoints.clear()
    sendState("lanDiscovering", false)
  }

  private fun beginSecureSession(endpointId: String) {
    try {
      val session = getOrCreateSecureSession(endpointId)
      sendRawWithoutPromise(endpointId, "$secureKeyPrefix${encodePublicKey(session)}", "secureKeyExchange")
    } catch (exception: Exception) {
      destroySecureSession(endpointId)
      sendError("secureKeyExchange", exception.localizedMessage ?: "Encrypted session setup failed.")
    }
  }

  private fun handleRemoteSecureKey(endpointId: String, encodedPublicKey: String) {
    try {
      val hadLocalSession = secureSessions.containsKey(endpointId)
      val session = getOrCreateSecureSession(endpointId)
      establishSecureSession(endpointId, encodedPublicKey)

      if (!hadLocalSession) {
        sendRawWithoutPromise(endpointId, "$secureKeyPrefix${encodePublicKey(session)}", "secureKeyExchange")
      }
    } catch (exception: Exception) {
      destroySecureSession(endpointId)
      sendError("secureKeyExchange", exception.localizedMessage ?: "Encrypted session setup failed.")
    }
  }

  private fun getOrCreateSecureSession(endpointId: String): SecureSession {
    return secureSessions.getOrPut(endpointId) {
      val generator = KeyPairGenerator.getInstance("EC")
      generator.initialize(ECGenParameterSpec("secp256r1"))
      SecureSession(generator.generateKeyPair())
    }
  }

  private fun encodePublicKey(session: SecureSession): String {
    return Base64.encodeToString(session.keyPair.public.encoded, Base64.NO_WRAP)
  }

  private fun establishSecureSession(endpointId: String, encodedPublicKey: String): String {
    val session = getOrCreateSecureSession(endpointId)
    val remotePublicKey = KeyFactory
      .getInstance("EC")
      .generatePublic(X509EncodedKeySpec(Base64.decode(encodedPublicKey, Base64.NO_WRAP)))
    val agreement = KeyAgreement.getInstance("ECDH")
    agreement.init(session.keyPair.private)
    agreement.doPhase(remotePublicKey, true)
    val sharedSecret = agreement.generateSecret()
    val keyBytes = MessageDigest
      .getInstance("SHA-256")
      .digest(sharedSecret + serviceId.toByteArray(Charsets.UTF_8))
    val key = SecretKeySpec(keyBytes, "AES")
    val fingerprintBytes = MessageDigest
      .getInstance("SHA-256")
      .digest("nextalk-fingerprint".toByteArray(Charsets.UTF_8) + keyBytes)
    val fingerprint = fingerprintBytes
      .take(6)
      .joinToString("")
      { byte -> "%02X".format(byte.toInt() and 0xFF) }
      .chunked(4)
      .joinToString("-")
    val pairingBytes = MessageDigest
      .getInstance("SHA-256")
      .digest("nextalk-pairing".toByteArray(Charsets.UTF_8) + keyBytes)
    val pairingSeed =
      ((pairingBytes[0].toInt() and 0xFF) shl 24) or
        ((pairingBytes[1].toInt() and 0xFF) shl 16) or
        ((pairingBytes[2].toInt() and 0xFF) shl 8) or
        (pairingBytes[3].toInt() and 0xFF)
    val authenticationDigits = (100000L + ((pairingSeed.toLong() and 0xFFFFFFFFL) % 900000L)).toString()

    session.key = key
    session.fingerprint = fingerprint
    sendEvent(
      "onSecureSessionChanged",
      mapOf("endpointId" to endpointId, "active" to true, "fingerprint" to fingerprint)
    )

    return authenticationDigits
  }

  private fun destroySecureSession(endpointId: String) {
    val removed = secureSessions.remove(endpointId)
    if (removed != null) {
      sendEvent(
        "onSecureSessionChanged",
        mapOf("endpointId" to endpointId, "active" to false, "fingerprint" to "")
      )
    }
  }

  private fun encryptMessage(message: String, key: SecretKeySpec): String {
    val iv = ByteArray(12)
    secureRandom.nextBytes(iv)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
    val encrypted = cipher.doFinal(message.toByteArray(Charsets.UTF_8))

    return "$securePayloadPrefix${Base64.encodeToString(iv, Base64.NO_WRAP)}:" +
      Base64.encodeToString(encrypted, Base64.NO_WRAP)
  }

  private fun decryptMessage(message: String, key: SecretKeySpec): String {
    val parts = message.removePrefix(securePayloadPrefix).split(":", limit = 2)
    require(parts.size == 2) { "Invalid encrypted payload." }
    val iv = Base64.decode(parts[0], Base64.NO_WRAP)
    val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
    return String(cipher.doFinal(encrypted), Charsets.UTF_8)
  }

  private fun handleRawPayload(endpointId: String, payloadId: Long, text: String, transport: String) {
    when {
      text.startsWith(secureKeyPrefix) -> {
        handleRemoteSecureKey(endpointId, text.removePrefix(secureKeyPrefix))
      }
      text.startsWith(securePayloadPrefix) -> {
        val key = secureSessions[endpointId]?.key
        if (key == null) {
          sendError("decryptPayload", "Encrypted payload arrived before the session key was ready.")
          return
        }

        try {
          val plaintext = decryptMessage(text, key)
          sendPayloadReceived(endpointId, payloadId, plaintext, transport, true)
          maybeShowBackgroundNotification(plaintext)
        } catch (exception: Exception) {
          sendError("decryptPayload", exception.localizedMessage ?: "Encrypted payload could not be opened.")
        }
      }
      else -> {
        sendPayloadReceived(endpointId, payloadId, text, transport, false)
      }
    }
  }

  private fun sendRawWithPromise(endpointId: String, message: String, operation: String, promise: Promise) {
    val lanPeer = lanPeers[endpointId]
    if (lanPeer != null) {
      try {
        writeLanData(lanPeer, message)
        promise.resolve(mapOf("payloadId" to System.currentTimeMillis()))
      } catch (exception: Exception) {
        rejectWithEvent(promise, operation, exception)
      }
      return
    }

    val client = getClientOrReject(promise, operation) ?: return
    val payload = Payload.fromBytes(message.toByteArray(Charsets.UTF_8))

    client
      .sendPayload(endpointId, payload)
      .addOnSuccessListener { promise.resolve(mapOf("payloadId" to payload.id)) }
      .addOnFailureListener { exception ->
        rejectWithEvent(promise, operation, exception)
      }
  }

  private fun sendRawWithoutPromise(endpointId: String, message: String, operation: String) {
    val lanPeer = lanPeers[endpointId]
    if (lanPeer != null) {
      try {
        writeLanData(lanPeer, message)
      } catch (exception: Exception) {
        sendError(operation, exception.localizedMessage ?: "Same-Wi-Fi payload send failed.")
      }
      return
    }

    val payload = Payload.fromBytes(message.toByteArray(Charsets.UTF_8))
    connectionsClient
      ?.sendPayload(endpointId, payload)
      ?.addOnFailureListener { exception ->
        sendError(operation, exception.localizedMessage ?: "Nearby payload send failed.")
      }
  }

  private fun maybeShowBackgroundNotification(plaintext: String) {
    if (silentMode) return

    val context = appContext.reactContext ?: return
    val payloadType = try {
      JSONObject(plaintext).optString("type")
    } catch (_: Exception) {
      return
    }

    if (payloadType != "message" || context.isAppInForeground()) return
    if (Build.VERSION.SDK_INT >= 33 && context.hasPermission("android.permission.POST_NOTIFICATIONS") != true) return

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(
          notificationChannelId,
          "Nearby messages",
          NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
          description = "Privacy-safe alerts for encrypted nearby messages"
        }
      )
    }

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        context,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, notificationChannelId)
    } else {
      Notification.Builder(context)
    }

    builder
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("NexTalk")
      .setContentText("New encrypted nearby message")
      .setAutoCancel(true)

    if (pendingIntent != null) {
      builder.setContentIntent(pendingIntent)
    }

    manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), builder.build())
  }

  private fun getClientOrReject(promise: Promise, operation: String): ConnectionsClient? {
    val client = connectionsClient
    if (client == null) {
      val message = "Nearby Connections is not available because the React context is missing."
      sendError(operation, message)
      promise.reject("ERR_NEXTALK_NEARBY_UNAVAILABLE", message, null)
    }
    return client
  }

  private fun rejectWithEvent(promise: Promise, operation: String, exception: Exception) {
    val message = exception.localizedMessage ?: "Nearby operation failed."
    sendError(operation, message)
    promise.reject("ERR_NEXTALK_NEARBY_OPERATION", message, exception)
  }

  private fun sendEndpointFound(endpointId: String, endpointName: String, foundServiceId: String, transport: String) {
    sendEvent(
      "onEndpointFound",
      mapOf(
        "endpointId" to endpointId,
        "endpointName" to endpointName.safeDisplayName(),
        "serviceId" to foundServiceId,
        "transport" to transport
      )
    )
  }

  private fun sendConnectionInitiated(
    endpointId: String,
    endpointName: String,
    authenticationDigits: String,
    isIncomingConnection: Boolean,
    transport: String
  ) {
    sendEvent(
      "onConnectionInitiated",
      mapOf(
        "endpointId" to endpointId,
        "endpointName" to endpointName.safeDisplayName(),
        "authenticationDigits" to authenticationDigits,
        "isIncomingConnection" to isIncomingConnection,
        "transport" to transport
      )
    )
  }

  private fun sendConnectionResult(
    endpointId: String,
    connected: Boolean,
    statusCode: Int,
    statusMessage: String,
    transport: String
  ) {
    sendEvent(
      "onConnectionResult",
      mapOf(
        "endpointId" to endpointId,
        "status" to if (connected) "connected" else "failed",
        "statusCode" to statusCode,
        "statusMessage" to statusMessage,
        "transport" to transport
      )
    )
  }

  private fun sendPayloadReceived(
    endpointId: String,
    payloadId: Long,
    text: String,
    transport: String,
    encrypted: Boolean
  ) {
    sendEvent(
      "onPayloadReceived",
      mapOf(
        "endpointId" to endpointId,
        "payloadId" to payloadId,
        "text" to text,
        "transport" to transport,
        "encrypted" to encrypted
      )
    )
  }

  private fun sendState(name: String, active: Boolean) {
    sendEvent("onStateChanged", mapOf("state" to name, "active" to active))
  }

  private fun sendError(operation: String, message: String) {
    sendEvent("onError", mapOf("operation" to operation, "message" to message))
  }

  private fun stopAll() {
    discoveredEndpoints.clear()
    connectionsClient?.stopAdvertising()
    connectionsClient?.stopDiscovery()
    connectionsClient?.stopAllEndpoints()
    stopLanDiscovery()
    stopLanAdvertising()
    lanPeers.values.toList().forEach { closeLanPeer(it, false) }
    secureSessions.keys.toList().forEach { destroySecureSession(it) }
    sendState("advertising", false)
    sendState("discovering", false)
  }

  private fun String.safeDisplayName(): String {
    val trimmed = trim()
    return if (trimmed.isEmpty()) "NexTalk User" else trimmed.take(48)
  }

  private fun String.isLanEndpoint() = startsWith("lan:")

  private fun Context?.safeBluetoothEnabled(): Boolean? {
    if (this == null) return null

    return try {
      val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      bluetoothManager?.adapter?.isEnabled
    } catch (_: SecurityException) {
      null
    }
  }

  private fun Context?.hasPermission(permission: String): Boolean? {
    if (this == null) return null

    return try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        true
      } else {
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
      }
    } catch (_: Exception) {
      false
    }
  }

  private fun Context?.safeWifiEnabled(): Boolean? {
    if (this == null) return null

    return try {
      val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      wifiManager?.isWifiEnabled
    } catch (_: SecurityException) {
      null
    }
  }

  private fun Context?.safeLocationEnabled(): Boolean? {
    if (this == null) return null

    return try {
      val locationManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        locationManager?.isLocationEnabled
      } else {
        val gpsEnabled = locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true
        val networkEnabled = locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true
        gpsEnabled || networkEnabled
      }
    } catch (_: SecurityException) {
      null
    }
  }

  private fun Context.isAppInForeground(): Boolean {
    val processInfo = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(processInfo)
    return processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
      processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
  }
}
