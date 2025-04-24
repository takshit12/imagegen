import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, GitCommit, Users, FileEdit } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "comment" | "commit" | "mention" | "update";
  user: {
    name: string;
    avatar: string;
  };
  content: string;
  timestamp: string;
  project?: string;
}

interface ActivityFeedProps {
  activities?: ActivityItem[];
}

const defaultActivities: ActivityItem[] = [
  {
    id: "1",
    type: "comment",
    user: {
      name: "Sarah Chen",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    },
    content: "Added comments on the UI design proposal",
    timestamp: "5m ago",
    project: "Website Redesign",
  },
  {
    id: "2",
    type: "commit",
    user: {
      name: "Alex Kim",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    },
    content: "Pushed 3 commits to main branch",
    timestamp: "15m ago",
    project: "Backend API",
  },
  {
    id: "3",
    type: "mention",
    user: {
      name: "Maria Garcia",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Maria",
    },
    content: "Mentioned you in the sprint planning document",
    timestamp: "1h ago",
  },
  {
    id: "4",
    type: "update",
    user: {
      name: "James Wilson",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=James",
    },
    content: "Updated the project timeline",
    timestamp: "2h ago",
    project: "Mobile App",
  },
];

const getActivityIcon = (type: ActivityItem["type"]) => {
  switch (type) {
    case "comment":
      return <MessageSquare className="h-4 w-4" />;
    case "commit":
      return <GitCommit className="h-4 w-4" />;
    case "mention":
      return <Users className="h-4 w-4" />;
    case "update":
      return <FileEdit className="h-4 w-4" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
};

const ActivityFeed = ({
  activities = defaultActivities,
}: ActivityFeedProps) => {
  return (
    <div className="h-full">
      <h2 className="text-lg font-semibold mb-4">Activity Feed</h2>
      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="space-y-4 pr-4">
          {activities.map((activity, index) => (
            <div key={activity.id} className="group">
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 mt-0.5">
                  <AvatarImage
                    src={activity.user.avatar}
                    alt={activity.user.name}
                  />
                  <AvatarFallback>{activity.user.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{activity.user.name}</span>
                    <span className="text-xs text-gray-500">
                      {activity.timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {activity.content}
                  </p>
                  {activity.project && (
                    <Badge variant="outline" className="mt-1 text-xs bg-gray-50">
                      {activity.project}
                    </Badge>
                  )}
                </div>
              </div>
              {index < activities.length - 1 && (
                <Separator className="my-4" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ActivityFeed;
