//
//  ContentView.swift
//  Friendbook
//
//  Created by Karl Jiang on 8/26/24.
//

import SwiftUI
import CoreData

struct ContentView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }
            
            FriendsView()
                .tabItem {
                    Label("Friends", systemImage: "person.2")
                }
            
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
    }
}

struct HomeView: View {
    @State private var messageText = ""
    @State private var messages: [String] = []
    
    var body: some View {
        NavigationView {
            VStack {
                ScrollView {
                    ForEach(messages, id: \.self) { message in
                        Text(message)
                            .padding()
                            .background(Color.gray.opacity(0.2))
                            .cornerRadius(10)
                            .padding(.horizontal)
                    }
                }
                
                HStack {
                    TextField("Type a message", text: $messageText)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding(.horizontal)
                    
                    Button(action: sendMessage) {
                        Image(systemName: "paperplane.fill")
                    }
                    .padding(.trailing)
                }
            }
            .navigationTitle("Chat")
        }
    }
    
    func sendMessage() {
        if !messageText.isEmpty {
            messages.append(messageText)
            messageText = ""
        }
    }
}

struct FriendsView: View {
    var body: some View {
        Text("Friends View")
    }
}

struct SettingsView: View {
    var body: some View {
        Text("Settings View")
    }
}

#Preview {
    ContentView()
}
