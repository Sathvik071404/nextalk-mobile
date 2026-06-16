export type PresenceStatus = 'online' | 'idle';
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

export interface NearbyUser {
  id: string;
  name: string;
  avatar: string;
  distance: number;
  angle: number;
  status: PresenceStatus;
  endpointId?: string;
  source?: 'demo' | 'nearby' | 'lan';
}

export interface Message {
  id: string;
  text: string;
  senderId: string | null;
  senderName: string;
  timestamp: string;
  kind: 'message' | 'system';
  status?: DeliveryStatus;
}

export const onboardingSlides = [
  {
    icon: 'radio-outline',
    title: 'Connect Without Internet',
    description: 'Chat with nearby people using local device connections when the internet is unavailable.',
  },
  {
    icon: 'scan-circle-outline',
    title: 'Discover Nearby People',
    description: 'Use the radar experience to find people around you and start conversations quickly.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Start Chats Quickly',
    description: 'Send a request, open a private nearby chat, and keep the conversation simple.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Private By Design',
    description: 'Keep the chat local-first and ready for a stronger real-world mobile networking layer later.',
  },
] as const;

export const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const nearbyAvatarColors = ['#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#10B981', '#F97316', '#6366F1', '#14B8A6'];

const hashText = (value: string) =>
  [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);

export const createNearbyUser = (
  endpointId: string,
  endpointName: string,
  source: 'nearby' | 'lan' = 'nearby'
): NearbyUser => {
  const hash = hashText(`${endpointId}:${endpointName}`);
  const name = endpointName.trim() || 'Nearby user';

  return {
    id: endpointId,
    endpointId,
    name,
    avatar: nearbyAvatarColors[hash % nearbyAvatarColors.length],
    distance: 5 + (hash % 35),
    angle: hash % 360,
    status: 'online',
    source,
  };
};

export const createDemoNearbyUsers = (sessionName: string): NearbyUser[] => {
  const base = sessionName.trim() || 'You';

  return [
    {
      id: 'demo-host-phone',
      name: `${base}'s demo host`,
      avatar: '#22D3EE',
      distance: 12,
      angle: 34,
      status: 'online',
      source: 'demo',
    },
    {
      id: 'demo-join-phone',
      name: 'Friend demo phone',
      avatar: '#10B981',
      distance: 23,
      angle: 214,
      status: 'online',
      source: 'demo',
    },
  ];
};

export const getUserById = (_userId?: string | string[]) => null;
